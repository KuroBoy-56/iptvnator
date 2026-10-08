/**
 * @jest-environment jsdom
 */
import {
    clearTenant,
    forgetTenantStorage,
    formatTenantExpiry,
    isTenantExpired,
    panelTenantFields,
    parseTenantConfig,
    readTenantCache,
    readTenantChoice,
    readTenantFeatures,
    saveTenantCode,
    saveTenantSkip,
    tenantErrorCode,
    tenantExpiredMessage,
    tenantStorageSuffix,
    withTenantQuery,
} from './panel-tenant.util';
import { buildTenantThemeCss, deriveTenantTheme, onAccentColor } from './panel-tenant-theme.util';

const CONFIG = {
    status: 'ok',
    tenant: {
        code: '123456',
        name: 'Mi TV',
        logo_url: 'https://panel.test/img/tenants/2/logo_3.png',
        logo_rev: 3,
        palette: { accent: '#ffd700', bg: '#00102A', surface: '#001B3A', text: '#FFFFFF' },
        expires_at: 1767243599,
        expires_date: '2025-12-31',
        tz: 'America/Panama',
        rev: 7,
    },
    features: { demo: false, alerts: true, sports: false },
    recheck_after: 3600,
    server_time: 1700000000,
};

describe('panel tenant util', () => {
    afterEach(() => {
        clearTenant();
        localStorage.clear();
    });

    it('parses tenant_config and normalises the palette', () => {
        const cache = parseTenantConfig(CONFIG, 1000);
        expect(cache).toMatchObject({
            code: '123456',
            name: 'Mi TV',
            logoRev: 3,
            palette: { accent: '#FFD700', bg: '#00102A' },
            expiresAt: 1767243599,
            features: { demo: false, alerts: true, sports: false },
            rev: 7,
            recheckAfter: 3600,
            lastOkCheck: 1000,
        });
    });

    it('treats null fields as the built-in values', () => {
        const cache = parseTenantConfig({
            ...CONFIG,
            tenant: { ...CONFIG.tenant, name: null, logo_url: null, palette: null, expires_date: null, expires_at: 0 },
            recheck_after: undefined,
        });
        expect(cache).toMatchObject({ name: null, logoUrl: null, palette: null, expiresDate: null, expiresAt: 0, recheckAfter: 21600 });
        expect(isTenantExpired(cache!)).toBe(false);
        expect(formatTenantExpiry(cache!)).toBe('');
    });

    it('rejects anything that is not an ok answer', () => {
        expect(parseTenantConfig({ error: 'x', code: 'tenant_invalid' })).toBeNull();
        expect(parseTenantConfig({ ...CONFIG, tenant: { ...CONFIG.tenant, code: '12' } })).toBeNull();
        expect(tenantErrorCode({ error: 'x', code: 'tenant_expired' })).toBe('tenant_expired');
        expect(tenantErrorCode({ error: 'x' })).toBeNull();
    });

    it('sends nothing with Omitir and tenant + app with a code', () => {
        expect(readTenantChoice()).toBe('none');
        saveTenantSkip();
        expect(readTenantChoice()).toBe('skip');
        expect(panelTenantFields()).toEqual({});
        expect(withTenantQuery('https://p/api/alerta.php?a=1')).toBe('https://p/api/alerta.php?a=1');
        expect(tenantStorageSuffix()).toBe('');
        expect(readTenantFeatures()).toEqual({ demo: true, alerts: true, sports: true });

        saveTenantCode(parseTenantConfig(CONFIG)!);
        expect(readTenantChoice()).toBe('code');
        expect(panelTenantFields()).toEqual({ tenant: '123456', app: 'windows' });
        expect(withTenantQuery('https://p/api/alerta.php?a=1')).toBe('https://p/api/alerta.php?a=1&t=123456&app=windows');
        expect(withTenantQuery('https://p/api/tmdb.php')).toBe('https://p/api/tmdb.php?t=123456&app=windows');
        expect(tenantStorageSuffix()).toBe('@t123456');
        expect(readTenantFeatures().sports).toBe(false);
        expect(readTenantCache()?.name).toBe('Mi TV');
    });

    it('forgets the per-distributor caches of a code', () => {
        localStorage.setItem('panel_sync_token2:u@h@t123456', 'tok');
        localStorage.setItem('panel_sync_token2:u@h', 'owner');
        forgetTenantStorage('123456');
        expect(localStorage.getItem('panel_sync_token2:u@h@t123456')).toBeNull();
        expect(localStorage.getItem('panel_sync_token2:u@h')).toBe('owner');
    });

    it('expires by UTC epoch and formats the date in Panama time', () => {
        const cache = { expiresAt: 1767243599, expiresDate: null };
        expect(isTenantExpired(cache, 1767243599 * 1000)).toBe(false);
        expect(isTenantExpired(cache, 1767243600 * 1000)).toBe(true);
        // 2026-01-01 04:59:59 UTC = 2025-12-31 23:59:59 in Panama
        expect(formatTenantExpiry(cache)).toBe('31/12/2025');
        expect(formatTenantExpiry({ expiresAt: 1, expiresDate: '2026-02-03' })).toBe('03/02/2026');
        expect(tenantExpiredMessage(cache)).toBe('Tu distribuidor venció el 31/12/2025 (hora de Panamá)');
    });
});

describe('panel tenant theme', () => {
    it('derives onAccent, textMuted and card', () => {
        expect(onAccentColor('#FFD700')).toBe('#000000');
        expect(onAccentColor('#E50914')).toBe('#FFFFFF');
        const theme = deriveTenantTheme({ accent: '#E50914', bg: '#141414', surface: '#181818', text: '#E5E5E5' });
        expect(theme.textMuted).toBe('rgba(229, 229, 229, 0.65)');
        // 8% of the way from #181818 to #E5E5E5
        expect(theme.card).toBe('#282828');
    });

    it('builds CSS only for a palette', () => {
        expect(buildTenantThemeCss(null)).toBe('');
        const css = buildTenantThemeCss({ accent: '#1E88E5', bg: '#0B1220', surface: '#131C2E', text: '#E6EDF7' });
        expect(css).toContain('--nf-red: #1E88E5;');
        expect(css).toContain('--nf-bg: #0B1220;');
        expect(css).toContain('body.dark-theme');
    });
});
