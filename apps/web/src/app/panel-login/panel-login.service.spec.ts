import { isDemoUser, PanelLoginService, parsePanelLineUrl } from './panel-login.service';

describe('PanelLoginService', () => {
    let request: jest.Mock;
    const service = new PanelLoginService();

    beforeEach(() => {
        request = jest.fn();
        Object.defineProperty(window, 'electron', {
            configurable: true,
            value: { panelLoginRequest: request, panelGetDeviceId: jest.fn().mockResolvedValue('AA:BB') },
        });
    });

    afterEach(() => {
        delete (window as unknown as { electron?: unknown }).electron;
    });

    it('parses the line url returned by check_mac', () => {
        expect(parsePanelLineUrl('http://srv.test:8080/get.php?username=u1&password=p1&type=m3u_plus&output=ts')).toEqual({
            server: 'http://srv.test:8080',
            username: 'u1',
            password: 'p1',
        });
        expect(parsePanelLineUrl('not a url')).toBeNull();
        expect(isDemoUser('demo_12345')).toBe(true);
        expect(isDemoUser('cliente')).toBe(false);
    });

    it('returns the active account for an activated device', async () => {
        request.mockResolvedValue({
            ok: true,
            status: 200,
            data: { exists: true, url: 'https://srv.test/get.php?username=demo_1&password=2' },
        });
        await expect(service.checkDevice()).resolves.toEqual({
            status: 'active',
            account: { server: 'https://srv.test', username: 'demo_1', password: '2', isDemo: true },
        });
        expect(request).toHaveBeenCalledWith('check_mac', undefined);
    });

    it('reports an inactive device', async () => {
        request.mockResolvedValue({ ok: true, status: 200, data: { exists: false } });
        await expect(service.checkDevice()).resolves.toEqual({ status: 'inactive' });
    });

    it('activates with submit_url', async () => {
        request.mockResolvedValue({ ok: true, status: 200, data: { status: 'ok' } });
        await expect(service.activate('u', 'p', 'http://dns.test')).resolves.toEqual({ ok: true });
        expect(request).toHaveBeenCalledWith('submit_url', { username: 'u', password: 'p', url: 'http://dns.test' });
    });

    it('returns demo credentials and marks a used demo as blocked', async () => {
        request.mockResolvedValueOnce({ ok: true, status: 200, data: { status: 'ok', username: 'demo_1', password: '9' } });
        await expect(service.autoDemo()).resolves.toEqual({ ok: true, username: 'demo_1', password: '9' });

        request.mockResolvedValueOnce({ ok: false, status: 403, error: 'Demo ya utilizado en este dispositivo.' });
        await expect(service.autoDemo()).resolves.toEqual({ ok: false, message: 'Demo ya utilizado en este dispositivo.', blocked: true });

        request.mockResolvedValueOnce({ ok: false, status: 429, error: 'Demasiadas demos desde esta conexión.' });
        await expect(service.autoDemo()).resolves.toMatchObject({ ok: false, blocked: false });
    });

    it('shows the missing-key error from the main process', async () => {
        request.mockResolvedValue({ ok: false, status: 0, code: 'NO_MASTER_KEY', error: 'Esta compilación no tiene la clave del panel (PANEL_MASTER_KEY).' });
        await expect(service.checkDevice()).resolves.toEqual({
            status: 'error',
            message: 'Esta compilación no tiene la clave del panel (PANEL_MASTER_KEY).',
        });
    });
});
