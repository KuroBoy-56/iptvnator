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
        expect(plain).toEqual({ mac_address: 'AA:BB:CC:DD:EE:FF:00:11' });
    });

    it('sends credentials and DNS for submit_url', async () => {
        const { fetch, calls } = fakeFetch(200, '{"status":"ok"}');
        await panelLoginRequest('submit_url', { username: ' u ', password: 'p', url: 'http://dns.test' }, { fetch, masterKey, deviceId: 'ID' });
        const plain = JSON.parse(decryptPayload(calls[0].body.get('data') ?? '', masterKey) ?? '{}');
        expect(plain).toEqual({ mac_address: 'ID', username: 'u', password: 'p', url: 'http://dns.test' });
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
