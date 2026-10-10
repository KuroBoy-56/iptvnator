import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import {
    clearTenant,
    PanelTenantCache,
    readTenantChoice,
    readTenantCode,
    saveTenantCode,
} from '@iptvnator/shared/interfaces';
import { AuthService } from '../auth.service';
import { PanelLoginService, TenantCheck } from './panel-login.service';
import { PanelSessionService } from './panel-session.service';
import { PanelTenantService, TENANT_OFFLINE_GRACE_MS } from './panel-tenant.service';

function cache(over: Partial<PanelTenantCache> = {}): PanelTenantCache {
    return {
        code: '123456',
        name: 'Mi TV',
        logoUrl: null,
        logoRev: 0,
        palette: null,
        expiresAt: 0,
        expiresDate: null,
        features: { demo: true, alerts: true, sports: true },
        rev: 1,
        recheckAfter: 21600,
        lastOkCheck: Date.now(),
        ...over,
    };
}

describe('PanelTenantService (guardian)', () => {
    let tenantConfig: jest.Mock<Promise<TenantCheck>, [string]>;
    let sessionClear: jest.Mock;
    let logout: jest.Mock;
    let navigate: jest.Mock;
    let service: PanelTenantService;

    beforeEach(() => {
        localStorage.clear();
        tenantConfig = jest.fn();
        sessionClear = jest.fn().mockResolvedValue(undefined);
        logout = jest.fn();
        navigate = jest.fn().mockResolvedValue(true);
        TestBed.configureTestingModule({
            providers: [
                { provide: PanelLoginService, useValue: { tenantConfig } },
                { provide: PanelSessionService, useValue: { clear: sessionClear } },
                { provide: AuthService, useValue: { logout } },
                { provide: Router, useValue: { navigate } },
            ],
        });
        service = TestBed.inject(PanelTenantService);
    });

    afterEach(() => clearTenant());

    it('stores a valid code from the distributor step', async () => {
        tenantConfig.mockResolvedValue({ status: 'ok', cache: cache() });
        await expect(service.submit('123456')).resolves.toBeNull();
        expect(readTenantCode()).toBe('123456');
        expect(service.branding.brandName()).toBe('Mi TV');
    });

    it('rejects a short code without calling the panel and shows panel errors', async () => {
        await expect(service.submit('12')).resolves.toContain('6 dígitos');
        expect(tenantConfig).not.toHaveBeenCalled();
        tenantConfig.mockResolvedValue({ status: 'no_key', message: 'Esta versión de la app no tiene la llave del panel' });
        await expect(service.submit('123456')).resolves.toBe('Esta versión de la app no tiene la llave del panel');
        expect(readTenantChoice()).toBe('none');
    });

    it('Omitir is remembered and never checks the panel', async () => {
        service.skip();
        expect(readTenantChoice()).toBe('skip');
        await expect(service.check()).resolves.toBe('ok');
        expect(tenantConfig).not.toHaveBeenCalled();
    });

    it('wipes code, session and branding when the panel says the distributor expired', async () => {
        saveTenantCode(cache());
        localStorage.setItem('panel_sync_token2:u@h@t123456', 'tok');
        tenantConfig.mockResolvedValue({ status: 'tenant_error', code: 'tenant_suspended', message: 'x' });
        await expect(service.check()).resolves.toBe('wiped');
        expect(readTenantChoice()).toBe('none');
        expect(localStorage.getItem('panel_sync_token2:u@h@t123456')).toBeNull();
        expect(sessionClear).toHaveBeenCalled();
        expect(logout).toHaveBeenCalled();
        expect(navigate).toHaveBeenCalledWith(['/login']);
        expect(service.notice()).toBe('Este distribuidor está suspendido. Contacta a tu distribuidor.');
    });

    it('treats a past expires_at as expired without asking the panel', async () => {
        saveTenantCode(cache({ expiresAt: 1767243599 }));
        await expect(service.check()).resolves.toBe('wiped');
        expect(tenantConfig).not.toHaveBeenCalled();
        expect(service.notice()).toBe('Tu distribuidor venció el 31/12/2025 (hora de Panamá)');
    });

    it('keeps the cache offline for 72 h, then asks to retry', async () => {
        tenantConfig.mockResolvedValue({ status: 'network', message: 'offline' });
        saveTenantCode(cache({ lastOkCheck: Date.now() - 3600_000 }));
        await expect(service.check()).resolves.toBe('offline');
        expect(readTenantCode()).toBe('123456');

        saveTenantCode(cache({ lastOkCheck: Date.now() - TENANT_OFFLINE_GRACE_MS - 1 }));
        await expect(service.check()).resolves.toBe('retry');
        expect(service.retryMessage()).toBeTruthy();
        expect(readTenantCode()).toBe('123456');
    });

    it('refreshes the branding when the panel answers ok', async () => {
        saveTenantCode(cache({ rev: 1, name: 'Viejo' }));
        tenantConfig.mockResolvedValue({ status: 'ok', cache: cache({ rev: 2, name: 'Nuevo' }) });
        await expect(service.check()).resolves.toBe('ok');
        expect(service.branding.name()).toBe('Nuevo');
    });

    it('"Cambiar distribuidor" forgets it and logs out', async () => {
        saveTenantCode(cache());
        await service.change();
        expect(readTenantChoice()).toBe('none');
        expect(logout).toHaveBeenCalled();
        expect(service.notice()).toBeNull();
    });
});
