import {
    clearSessionCredentials,
    clearTenant,
    getPanelApiBase,
    saveTenantCode,
    saveTenantSkip,
    setSessionAlertAccounts,
} from '@iptvnator/shared/interfaces';
import { fetchPanelAlert, parsePanelAlert } from './panel-alert.util';

const ROOT = 'https://panel.test/panel/';

describe('parsePanelAlert', () => {
    it('maps a welcome alert and resolves the image against the panel root', () => {
        expect(
            parsePanelAlert(
                {
                    type: 'welcome',
                    days: 20,
                    title: '★ ¡Bienvenido! ★',
                    message: 'Hola\nmundo',
                    image: 'http://other/img/alertas/promo_1.jpg',
                    image_path: 'img/alertas/promo_1.jpg',
                    button: 'ENTENDIDO',
                },
                ROOT
            )
        ).toEqual({
            expiry: false,
            title: '★ ¡Bienvenido! ★',
            message: 'Hola\nmundo',
            image: `${ROOT}img/alertas/promo_1.jpg`,
            button: 'ENTENDIDO',
        });
    });

    it('never shows an image on expiry alerts and rejects odd image paths', () => {
        expect(
            parsePanelAlert({ type: 'expiry', title: 't', message: 'm', image_path: 'img/alertas/a.jpg' }, ROOT)
                ?.image
        ).toBe('');
        expect(
            parsePanelAlert({ type: 'welcome', image_path: '../secret.php', image: 'javascript:x' }, ROOT)?.image
        ).toBe('');
    });

    it('returns null for anything that is not an alert (old HTML panel, errors)', () => {
        expect(parsePanelAlert(null, ROOT)).toBeNull();
        expect(parsePanelAlert({ error: 'x' }, ROOT)).toBeNull();
    });
});

describe('fetchPanelAlert', () => {
    afterEach(() => clearSessionCredentials());

    const reply = (body: unknown) =>
        Promise.resolve({ ok: true, json: () => Promise.resolve(body) } as Response);

    it('asks alerta.php for JSON with the line credentials', async () => {
        setSessionAlertAccounts([{ user: 'u', pass: 'p&q', dns: 'http://dns:80', title: 'Línea' }]);
        const fetcher = jest.fn(() => reply({ type: 'welcome', title: 'W', message: '' }));
        const alert = await fetchPanelAlert(fetcher as unknown as typeof fetch);
        expect(alert?.title).toBe('W');
        const url = new URL((fetcher.mock.calls[0] as unknown[])[0] as string);
        expect(url.href.startsWith(`${getPanelApiBase()}alerta.php?`)).toBe(true);
        expect(Object.fromEntries(url.searchParams)).toEqual({
            format: 'json',
            user: 'u',
            pass: 'p&q',
            dns: 'http://dns:80',
            title: 'Línea',
        });
    });

    it('prefers an expiry warning over a welcome among several lines', async () => {
        setSessionAlertAccounts([
            { user: 'a', pass: 'p', dns: 'http://a', title: '' },
            { user: 'b', pass: 'p', dns: 'http://b', title: '' },
        ]);
        const fetcher = jest
            .fn()
            .mockReturnValueOnce(reply({ type: 'welcome', title: 'W' }))
            .mockReturnValueOnce(reply({ type: 'expiry', title: 'E' }));
        expect((await fetchPanelAlert(fetcher))?.title).toBe('E');
    });

    it('is null without a session or when the panel fails', async () => {
        expect(await fetchPanelAlert(jest.fn())).toBeNull();
        setSessionAlertAccounts([{ user: 'a', pass: 'p', dns: 'http://a', title: '' }]);
        expect(await fetchPanelAlert(jest.fn(() => Promise.reject(new Error('net'))))).toBeNull();
    });

    describe('with a distributor', () => {
        const cache = (alerts: boolean) => ({
            code: '123456', name: 'X', logoUrl: null, logoRev: 0, palette: null, expiresAt: 0,
            expiresDate: null, features: { demo: true, alerts, sports: true }, rev: 1,
            recheckAfter: 21600, lastOkCheck: Date.now(),
        });
        afterEach(() => clearTenant());

        it('adds t + app to the alerta.php query', async () => {
            saveTenantCode(cache(true));
            setSessionAlertAccounts([{ user: 'u', pass: 'p', dns: 'http://dns', title: '' }]);
            const fetcher = jest.fn(() => reply({ type: 'welcome', title: 'W' }));
            await fetchPanelAlert(fetcher as unknown as typeof fetch);
            const url = new URL((fetcher.mock.calls[0] as unknown[])[0] as string);
            expect(url.searchParams.get('t')).toBe('123456');
            expect(url.searchParams.get('app')).toBe('windows');
        });

        it('skips the alert when the distributor turned alerts off', async () => {
            saveTenantCode(cache(false));
            setSessionAlertAccounts([{ user: 'u', pass: 'p', dns: 'http://dns', title: '' }]);
            const fetcher = jest.fn(() => reply({ type: 'welcome', title: 'W' }));
            expect(await fetchPanelAlert(fetcher as unknown as typeof fetch)).toBeNull();
            expect(fetcher).not.toHaveBeenCalled();
        });

        it('sends no tenant with Omitir', async () => {
            saveTenantSkip();
            setSessionAlertAccounts([{ user: 'u', pass: 'p', dns: 'http://dns', title: '' }]);
            const fetcher = jest.fn(() => reply({ type: 'welcome', title: 'W' }));
            await fetchPanelAlert(fetcher as unknown as typeof fetch);
            const url = new URL((fetcher.mock.calls[0] as unknown[])[0] as string);
            expect(url.searchParams.has('t')).toBe(false);
        });
    });
});
