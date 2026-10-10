import {
    clearTenant,
    PANEL_TENANT_ERROR_EVENT,
    parseTenantConfig,
    saveTenantCode,
    saveTenantSkip,
} from '@iptvnator/shared/interfaces';
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
        await expect(service.checkDevice()).resolves.toEqual({ status: 'inactive', fake: null });
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

describe('PanelLoginService with a distributor', () => {
    let request: jest.Mock;
    const service = new PanelLoginService();
    const config = {
        status: 'ok',
        tenant: { code: '123456', name: 'Mi TV', logo_url: null, logo_rev: 0, palette: null, expires_at: 0, expires_date: null, rev: 1 },
        features: { demo: true, alerts: true, sports: true },
        recheck_after: 21600,
    };

    beforeEach(() => {
        request = jest.fn();
        Object.defineProperty(window, 'electron', { configurable: true, value: { panelLoginRequest: request } });
    });

    afterEach(() => {
        clearTenant();
        delete (window as unknown as { electron?: unknown }).electron;
    });

    it('forwards the chosen code with every action and nothing with Omitir', async () => {
        request.mockResolvedValue({ ok: true, status: 200, data: [] });
        saveTenantSkip();
        await service.fetchDns();
        expect(request).toHaveBeenLastCalledWith('fetch_dns', undefined);

        saveTenantCode(parseTenantConfig(config)!);
        await service.fetchDns();
        expect(request).toHaveBeenLastCalledWith('fetch_dns', { tenant: '123456' });
    });

    it('maps tenant_config answers', async () => {
        request.mockResolvedValueOnce({ ok: true, status: 200, data: config });
        await expect(service.tenantConfig('123456')).resolves.toMatchObject({ status: 'ok', cache: { code: '123456', name: 'Mi TV' } });
        expect(request).toHaveBeenCalledWith('tenant_config', { tenant: '123456' });

        request.mockResolvedValueOnce({ ok: false, status: 404, code: 'HTTP', data: { error: 'x', code: 'tenant_invalid' } });
        await expect(service.tenantConfig('000000')).resolves.toEqual({
            status: 'tenant_error',
            code: 'tenant_invalid',
            message: 'Número de distribuidor no válido',
        });

        request.mockResolvedValueOnce({ ok: false, status: 0, code: 'NO_MASTER_KEY' });
        await expect(service.tenantConfig('123456')).resolves.toEqual({
            status: 'no_key',
            message: 'Esta versión de la app no tiene la llave del panel',
        });

        request.mockResolvedValueOnce({ ok: false, status: 502, code: 'BAD_RESPONSE' });
        await expect(service.tenantConfig('123456')).resolves.toMatchObject({ status: 'network' });
    });

    it('reports a fatal tenant error from any action to the guardian', async () => {
        saveTenantCode(parseTenantConfig(config)!);
        const seen: unknown[] = [];
        const listener = (e: Event) => seen.push((e as CustomEvent).detail);
        window.addEventListener(PANEL_TENANT_ERROR_EVENT, listener);
        request.mockResolvedValue({ ok: false, status: 403, code: 'HTTP', data: { error: 'x', code: 'tenant_suspended' } });
        await service.checkDevice();
        window.removeEventListener(PANEL_TENANT_ERROR_EVENT, listener);
        expect(seen).toEqual(['tenant_suspended']);
    });
});
