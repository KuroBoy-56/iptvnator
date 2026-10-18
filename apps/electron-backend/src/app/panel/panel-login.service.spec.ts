import { decryptPayload, encryptPayload } from './panel-crypto';
import { PanelFetch, panelLoginRequest } from './panel-login.service';

const masterKey = Buffer.from('cd'.repeat(32), 'hex');

function fakeFetch(status: number, text: string) {
    const calls: { url: string; body: URLSearchParams }[] = [];
    const fetch: PanelFetch = async (url, init) => {
        calls.push({ url, body: new URLSearchParams(init.body) });
        return { status, text: async () => text };
    };
    return { fetch, calls };
}

describe('panelLoginRequest', () => {
    it('posts action + encrypted data with the device id as mac_address', async () => {
        const { fetch, calls } = fakeFetch(200, '{"exists":false}');
        const result = await panelLoginRequest('check_mac', undefined, { fetch, masterKey, deviceId: 'AA:BB:CC:DD:EE:FF:00:11' });

        expect(result).toEqual({ ok: true, status: 200, data: { exists: false } });
        expect(calls[0].url).toMatch(/\/api\/login\.php$/);
        expect(calls[0].body.get('action')).toBe('check_mac');
        const plain = JSON.parse(decryptPayload(calls[0].body.get('data') ?? '', masterKey) ?? '{}');
        expect(plain).toEqual({ mac_address: 'AA:BB:CC:DD:EE:FF:00:11', enc: 1, platform: 'windows', cc: 0, ts: expect.any(Number) });
    });

    it('retries once with the panel clock when the device clock is wrong (ts_expired)', async () => {
        const calls: URLSearchParams[] = [];
        const serverTime = Math.floor(Date.now() / 1000) + 3600;
        const fetch: PanelFetch = async (_url, init) => {
            calls.push(new URLSearchParams(init.body));
            return calls.length === 1
                ? { status: 401, text: async () => JSON.stringify({ error: 'x', code: 'ts_expired', server_time: serverTime }) }
                : { status: 200, text: async () => '{"status":"ok"}' };
        };
        const result = await panelLoginRequest('submit_url', { username: 'u', password: 'p', url: 'http://dns.test' }, { fetch, masterKey, deviceId: 'ID' });
        expect(result.ok).toBe(true);
        expect(calls).toHaveLength(2);
        const ts = (b: URLSearchParams) => JSON.parse(decryptPayload(b.get('data') ?? '', masterKey) ?? '{}').ts as number;
        expect(Math.abs(ts(calls[1]) - serverTime)).toBeLessThanOrEqual(2);
    });

    it('sends credentials and DNS for submit_url', async () => {
        const { fetch, calls } = fakeFetch(200, '{"status":"ok"}');
        await panelLoginRequest('submit_url', { username: ' u ', password: 'p', url: 'http://dns.test' }, { fetch, masterKey, deviceId: 'ID' });
        const plain = JSON.parse(decryptPayload(calls[0].body.get('data') ?? '', masterKey) ?? '{}');
        expect(plain).toEqual({ mac_address: 'ID', username: 'u', password: 'p', url: 'http://dns.test', platform: 'windows', ts: expect.any(Number) });
    });

    it('sends the app language inside the encrypted payload of every action', async () => {
        const { fetch, calls } = fakeFetch(200, '{"status":"ok"}');
        await panelLoginRequest('submit_url', { username: 'u', password: 'p', url: 'http://dns.test', lang: 'pt' }, { fetch, masterKey, deviceId: 'ID' });
        await panelLoginRequest('tenant_config', { tenant: '123456', lang: 'fr' }, { fetch, masterKey, deviceId: 'ID' });
        await panelLoginRequest('check_mac', { lang: 'xx' }, { fetch, masterKey, deviceId: 'ID' });
        const plain = (i: number) => JSON.parse(decryptPayload(calls[i].body.get('data') ?? '', masterKey) ?? '{}');
        expect(plain(0).lang).toBe('pt');
        expect(plain(1).lang).toBe('fr');
        // only es/en/pt/fr go to the panel
        expect(plain(2).lang).toBeUndefined();
    });

    it('decrypts the fetch_dns response', async () => {
        const { fetch } = fakeFetch(200, encryptPayload('["http://a.test","http://b.test"]', masterKey));
        const result = await panelLoginRequest('fetch_dns', undefined, { fetch, masterKey, deviceId: 'ID' });
        expect(result.data).toEqual(['http://a.test', 'http://b.test']);
    });

    it('surfaces the panel message for a used demo (403)', async () => {
        const { fetch } = fakeFetch(403, '{"error":"Demo ya utilizado en este dispositivo o dispositivo ya registrado."}');
        const result = await panelLoginRequest('auto_demo', undefined, { fetch, masterKey, deviceId: 'ID' });
        expect(result).toMatchObject({ ok: false, status: 403, code: 'HTTP', error: expect.stringContaining('Demo ya utilizado') });
    });

    it('reports a missing master key without calling the panel', async () => {
        const { fetch, calls } = fakeFetch(200, '{}');
        const result = await panelLoginRequest('auto_demo', undefined, { fetch, masterKey: null, deviceId: 'ID' });
        expect(result.code).toBe('NO_MASTER_KEY');
        expect(calls).toHaveLength(0);
    });

    it('reports network failures', async () => {
        const fetch: PanelFetch = async () => {
            throw new Error('offline');
        };
        const result = await panelLoginRequest('check_mac', undefined, { fetch, masterKey, deviceId: 'ID' });
        expect(result.code).toBe('NETWORK');
    });
});

describe('panelLoginRequest with a distributor', () => {
    it('adds tenant + app to the payload only when a code is given', async () => {
        const { fetch, calls } = fakeFetch(200, '{"exists":false}');
        await panelLoginRequest('check_mac', { tenant: '123456' }, { fetch, masterKey, deviceId: 'ID' });
        const plain = JSON.parse(decryptPayload(calls[0].body.get('data') ?? '', masterKey) ?? '{}');
        expect(plain).toEqual({ mac_address: 'ID', tenant: '123456', app: 'windows', enc: 1, platform: 'windows', cc: 0, ts: expect.any(Number) });
    });

    it('sends {code, app, device} for tenant_config and decrypts the answer', async () => {
        const config = { status: 'ok', tenant: { code: '123456', name: 'Mi TV' }, features: { demo: true } };
        const { fetch, calls } = fakeFetch(200, encryptPayload(JSON.stringify(config), masterKey));
        const result = await panelLoginRequest('tenant_config', { tenant: '123456' }, { fetch, masterKey, deviceId: 'DEV' });

        expect(calls[0].body.get('action')).toBe('tenant_config');
        const plain = JSON.parse(decryptPayload(calls[0].body.get('data') ?? '', masterKey) ?? '{}');
        expect(plain).toEqual({ code: '123456', app: 'windows', device: 'DEV', ts: expect.any(Number) });
        expect(result).toEqual({ ok: true, status: 200, data: config });
    });

    it('returns the plain JSON tenant error with its code', async () => {
        const { fetch } = fakeFetch(404, '{"error":"Número de distribuidor no válido.","code":"tenant_invalid"}');
        const result = await panelLoginRequest('tenant_config', { tenant: '000000' }, { fetch, masterKey, deviceId: 'ID' });
        expect(result).toMatchObject({ ok: false, status: 404, code: 'HTTP', data: { code: 'tenant_invalid' } });
    });

    it('rejects a malformed code without calling the panel', async () => {
        const { fetch, calls } = fakeFetch(200, '{}');
        const result = await panelLoginRequest('tenant_config', { tenant: '12ab' }, { fetch, masterKey, deviceId: 'ID' });
        expect(result.ok).toBe(false);
        expect(calls).toHaveLength(0);
    });

    it('decrypts an encrypted check_mac line (enc: 1)', async () => {
        const line = '{"exists":true,"url":"http://s.test/get.php?username=u&password=p"}';
        const { fetch } = fakeFetch(200, encryptPayload(line, masterKey));
        const result = await panelLoginRequest('check_mac', undefined, { fetch, masterKey, deviceId: 'ID' });
        expect(result).toEqual({ ok: true, status: 200, data: JSON.parse(line) });
    });

    it('rejects an encrypted line it cannot decrypt', async () => {
        const other = Buffer.from('ab'.repeat(32), 'hex');
        const { fetch } = fakeFetch(200, encryptPayload('{"status":"ok"}', other));
        const result = await panelLoginRequest('auto_demo', undefined, { fetch, masterKey, deviceId: 'ID' });
        expect(result).toMatchObject({ ok: false, code: 'BAD_RESPONSE' });
    });

    it('sends a reseller demo code (uppercase) only with auto_demo', async () => {
        const { fetch, calls } = fakeFetch(200, encryptPayload('{"status":"ok","username":"d","password":"x"}', masterKey));
        const result = await panelLoginRequest('auto_demo', { reseller: ' rv7k2m ' }, { fetch, masterKey, deviceId: 'ID' });
        expect(result.data).toEqual({ status: 'ok', username: 'd', password: 'x' });
        const plain = JSON.parse(decryptPayload(calls[0].body.get('data') ?? '', masterKey) ?? '{}');
        expect(plain).toEqual({ mac_address: 'ID', reseller: 'RV7K2M', enc: 1, platform: 'windows', ts: expect.any(Number) });
    });

    it('never sends a digits-only password as a reseller code', async () => {
        const { fetch, calls } = fakeFetch(404, '{"error":"no"}');
        await panelLoginRequest('auto_demo', { reseller: '123456' }, { fetch, masterKey, deviceId: 'ID' });
        await panelLoginRequest('check_mac', { reseller: 'RV7K2M' }, { fetch, masterKey, deviceId: 'ID' });
        const first = JSON.parse(decryptPayload(calls[0].body.get('data') ?? '', masterKey) ?? '{}');
        const second = JSON.parse(decryptPayload(calls[1].body.get('data') ?? '', masterKey) ?? '{}');
        expect(first.reseller).toBeUndefined();
        expect(second.reseller).toBeUndefined();
    });

    it('sends the last applied cache-clear order (cc) only with check_mac', async () => {
        const { fetch, calls } = fakeFetch(200, '{"exists":false,"cache_clear":7}');
        const result = await panelLoginRequest('check_mac', { cc: 5 }, { fetch, masterKey, deviceId: 'ID' });
        await panelLoginRequest('fetch_dns', { cc: 5 }, { fetch, masterKey, deviceId: 'ID' });
        const plain = (i: number) => JSON.parse(decryptPayload(calls[i].body.get('data') ?? '', masterKey) ?? '{}');
        expect(plain(0).cc).toBe(5);
        expect(plain(1).cc).toBeUndefined();
        expect(result.data).toEqual({ exists: false, cache_clear: 7 });
    });

    it('asks features and reads its plain JSON answer', async () => {
        const { fetch, calls } = fakeFetch(200, '{"status":"ok","features":{"demo":false,"dns":true}}');
        const result = await panelLoginRequest('features', undefined, { fetch, masterKey, deviceId: 'ID' });
        expect(calls[0].body.get('action')).toBe('features');
        expect(result).toEqual({ ok: true, status: 200, data: { status: 'ok', features: { demo: false, dns: true } } });
    });

    it('does not ask fetch_dns / submit_url for enc', async () => {
        const { fetch, calls } = fakeFetch(200, '{"status":"ok"}');
        await panelLoginRequest('submit_url', { username: 'u', password: 'p', url: 'http://d.test' }, { fetch, masterKey, deviceId: 'ID' });
        const plain = JSON.parse(decryptPayload(calls[0].body.get('data') ?? '', masterKey) ?? '{}');
        expect(plain.enc).toBeUndefined();
    });
});
