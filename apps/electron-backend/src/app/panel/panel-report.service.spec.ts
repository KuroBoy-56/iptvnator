import { decryptPayload } from './panel-crypto';
import { panelReportError } from './panel-report.service';

const key = Buffer.alloc(32, 7);

function deps(status = 200) {
    const fetch = jest.fn(async () => ({ status, text: async () => '{"ok":true}' }));
    return { fetch, masterKey: key, deviceId: 'AA:BB:CC:DD:EE:FF', version: '1.2.3' };
}

describe('panelReportError', () => {
    it('sends an encrypted report to report.php', async () => {
        const d = deps();
        const ok = await panelReportError({ kind: 'playback', message: 'boom 1', detail: 'stack', tenant: '123456' }, d);
        expect(ok).toBe(true);
        const [url, init] = d.fetch.mock.calls[0] as unknown as [string, { body: string }];
        expect(url).toMatch(/report\.php$/);
        const data = new URLSearchParams(init.body).get('data') ?? '';
        const body = JSON.parse(decryptPayload(data, key) ?? '{}');
        expect(body).toMatchObject({ kind: 'playback', message: 'boom 1', device: 'AA:BB:CC:DD:EE:FF', version: '1.2.3', tenant: '123456' });
        expect(['windows', 'macos']).toContain(body.app);
    });

    it('sends the same message once a minute and never without a key', async () => {
        const d = deps();
        await panelReportError({ kind: 'error', message: 'same' }, d);
        expect(await panelReportError({ kind: 'error', message: 'same' }, d)).toBe(false);
        expect(d.fetch).toHaveBeenCalledTimes(1);
        expect(await panelReportError({ kind: 'error', message: 'other' }, { ...d, masterKey: null })).toBe(false);
        expect(await panelReportError({ kind: 'error', message: '  ' }, d)).toBe(false);
    });

    it('drops an invalid kind and a malformed tenant, and never throws', async () => {
        const d = deps();
        d.fetch.mockRejectedValueOnce(new Error('offline'));
        expect(await panelReportError({ kind: 'evil' as never, message: 'x1', tenant: '12' }, d)).toBe(false);
        const init = (d.fetch.mock.calls[0] as unknown as [string, { body: string }])[1];
        const body = JSON.parse(decryptPayload(new URLSearchParams(init.body).get('data') ?? '', key) ?? '{}');
        expect(body.kind).toBe('error');
        expect(body.tenant).toBeUndefined();
    });
});
