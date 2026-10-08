import { lineKey } from './panel-progress.client';
import { PanelSyncService } from './panel-sync.service';

type Call = { url: string; init?: RequestInit };

function jsonResponse(body: unknown, status = 200): Response {
    return {
        ok: status >= 200 && status < 300,
        status,
        json: async () => body,
    } as Response;
}

describe('PanelSyncService', () => {
    let calls: Call[];
    let snapshot: { progress: Record<string, unknown>; favorites: unknown[] };
    const creds = { username: 'line1', password: 'secret', server: 'http://dns.test:8080' };

    beforeEach(() => {
        localStorage.clear();
        calls = [];
        snapshot = {
            progress: {
                'Movie A': { position: 100, duration: 1000, type: 'movie', id: '10' },
            },
            favorites: [{ id: '3', type: 'live', title: 'Canal' }],
        };
        global.fetch = jest.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
            calls.push({ url: String(url), init });
            if (init?.method === 'POST') {
                const body = JSON.parse(String(init.body));
                if (body.action === 'auth') return jsonResponse({ success: true, token: 'tok' });
                return jsonResponse({ success: true });
            }
            return jsonResponse(snapshot);
        }) as typeof fetch;
    });

    function service(): PanelSyncService {
        return new PanelSyncService();
    }

    it('authenticates once and keeps only the token', async () => {
        const tree = await service().getAllProgress(creds);
        expect(tree.Movie['10'].timeline).toBe(100);
        const auth = calls.filter((c) => c.init?.method === 'POST');
        expect(auth).toHaveLength(1);
        expect(JSON.parse(String(auth[0].init?.body))).toEqual({ action: 'auth', user: 'line1', pass: 'secret', dns: 'http://dns.test:8080' });
        expect(calls[1].url).toContain('progress.php?v=2');
        expect((calls[1].init?.headers as Record<string, string>)['Authorization']).toBe('Bearer tok');
        expect(localStorage.getItem('panel_sync_token2:line1@dns.test:8080')).toBe('tok');
        expect(JSON.stringify(localStorage)).not.toContain('secret');
    });

    it('keys a line by user + host, whatever the scheme', () => {
        expect(lineKey({ username: 'u', server: 'https://Host.tv:8080/' })).toBe('u@host.tv:8080');
        expect(lineKey({ username: 'u', server: 'http://host.tv:8080' })).toBe('u@host.tv:8080');
    });

    it('reads a resume position from the panel', async () => {
        expect(await service().getProgress(creds, { type: 'movie', id: 10 })).toBe(100);
    });

    it('saves movie progress with the token and the panel fields', async () => {
        await service().saveProgress(creds, { type: 'movie', id: 10, title: 'Movie A', poster: 'https://p/a.jpg' }, 250, 1000);
        const save = calls.map((c) => c.init?.body && JSON.parse(String(c.init.body))).find((b) => b?.action === 'save');
        expect(save).toMatchObject({ action: 'save', title: 'Movie A', type: 'movie', id: '10', position: 250, duration: 1000, token: 'tok' });
        expect(save.pass).toBeUndefined();
    });

    it('moves the item just watched to the front of the local snapshot', async () => {
        snapshot.progress = {
            'Movie A': { position: 100, duration: 1000, type: 'movie', id: '10', ts: 1_700_000_000 },
            'Movie B': { position: 100, duration: 1000, type: 'movie', id: '11', ts: 1_750_000_000 },
        };
        const svc = service();
        await svc.saveProgress(creds, { type: 'movie', id: 10, title: 'Movie A' }, 250, 1000);
        const tree = await svc.getAllProgress(creds);
        expect(tree.Movie['10'].timestamp).toBeGreaterThan(tree.Movie['11'].timestamp);
    });

    it('stamps a favorite just added as the newest one', async () => {
        snapshot.favorites = [{ id: '3', type: 'live', title: 'Canal', ts: 1_750_000_000 }];
        const svc = service();
        await svc.getAllFavorites(creds);
        await svc.addFavorite(creds, 'Movie', 7, 0, { title: 'M' });
        const tree = await svc.getAllFavorites(creds);
        expect(tree.Movie['7'].timestamp).toBeGreaterThan(tree.LiveTv['3'].timestamp);
    });

    it('deletes the entry once 95% is watched', async () => {
        await service().saveProgress(creds, { type: 'movie', id: 10, title: 'Movie A' }, 960, 1000);
        const bodies = calls.map((c) => c.init?.body && JSON.parse(String(c.init.body))).filter(Boolean);
        expect(bodies.find((b) => b.action === 'delete')).toMatchObject({ title: 'Movie A' });
        expect(bodies.find((b) => b.action === 'save')).toBeUndefined();
    });

    it('saves episodes as one entry per series keyed by the series title', async () => {
        await service().saveProgress(creds, { type: 'series', id: 501, categoryId: 50, seriesTitle: 'Show B', title: 'S01E01' }, 60, 1500);
        const save = calls.map((c) => c.init?.body && JSON.parse(String(c.init.body))).find((b) => b?.action === 'save');
        expect(save).toMatchObject({ title: 'Show B', type: 'episode', id: '501', seriesId: '50' });
    });

    it('adds and removes favorites through the panel', async () => {
        await service().addFavorite(creds, 'Movie', 7, 0, { title: 'M', thumbnail: 'https://p/m.jpg' });
        await service().removeFavorite(creds, 'LiveTv', 3);
        const bodies = calls.map((c) => c.init?.body && JSON.parse(String(c.init.body))).filter(Boolean);
        expect(bodies.find((b) => b.action === 'fav_add').item).toMatchObject({ id: '7', type: 'movie', title: 'M', poster: 'https://p/m.jpg' });
        expect(bodies.find((b) => b.action === 'fav_remove')).toMatchObject({ id: '3', type: 'live' });
    });

    it('keeps a favorite that could not be sent and retries it later', async () => {
        let panelUp = false;
        const base = global.fetch as jest.Mock;
        global.fetch = jest.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
            const body = init?.body ? JSON.parse(String(init.body)) : null;
            if (!panelUp && body?.action?.startsWith('fav_')) throw new Error('offline');
            return base(url, init);
        }) as typeof fetch;
        const svc = service();

        expect(await svc.addFavorite(creds, 'Series', 290, 0, { title: 'Krypton' })).toBe(false);
        // the button and the cache rebuild still see it while it is pending
        expect(await svc.isFavorite(creds, 'Series', 290)).toBe(true);
        expect((await svc.getAllFavorites(creds)).Series['290']).toBeDefined();
        // it survives a restart of the app
        expect(await service().isFavorite(creds, 'Series', 290)).toBe(true);

        panelUp = true;
        await svc.flushFavorites(creds);
        const sent = calls.map((c) => c.init?.body && JSON.parse(String(c.init.body))).filter((b) => b?.action === 'fav_add');
        expect(sent.map((b) => b.item.id)).toEqual(['290']);
        await svc.flushFavorites(creds);
        expect(calls.filter((c) => String(c.init?.body ?? '').includes('fav_add'))).toHaveLength(1);
    });

    it('a fresh removal wins over a panel snapshot that still lists the favorite', async () => {
        const svc = service();
        await svc.getAllFavorites(creds); // snapshot with live 3
        snapshot.favorites = [{ id: '3', type: 'live', title: 'Canal' }]; // panel not updated yet
        await svc.removeFavorite(creds, 'LiveTv', 3);
        await svc.refresh(creds);
        expect((await svc.getAllFavorites(creds)).LiveTv['3']).toBeUndefined();
        expect(await svc.isFavorite(creds, 'LiveTv', 3)).toBe(false);
    });

    it('reports an unreadable panel so the local cache is not wiped', async () => {
        global.fetch = jest.fn(async () => jsonResponse({}, 500)) as typeof fetch;
        localStorage.setItem('panel_sync_token2:line1@dns.test:8080', 'tok');
        expect(await service().refresh(creds)).toBe(false);
    });

    it('re-authenticates once when the stored token is rejected', async () => {
        localStorage.setItem('panel_sync_token2:line1@dns.test:8080', 'old');
        let first = true;
        global.fetch = jest.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
            calls.push({ url: String(url), init });
            if (init?.method === 'POST') return jsonResponse({ success: true, token: 'new' });
            if (first) {
                first = false;
                return jsonResponse({ error: 'No autorizado' }, 401);
            }
            return jsonResponse(snapshot);
        }) as typeof fetch;
        const favs = await service().getAllFavorites(creds);
        expect(favs.LiveTv['3'].title).toBe('Canal');
        expect(localStorage.getItem('panel_sync_token2:line1@dns.test:8080')).toBe('new');
    });

    it('throttles periodic saves but always sends a forced save', async () => {
        const svc = service();
        const info = { type: 'movie', id: 10, title: 'Movie A' };
        await svc.saveProgress(creds, info, 100, 1000);
        await svc.saveProgress(creds, info, 102, 1000);
        await svc.saveProgress(creds, info, 104, 1000, { force: true });
        const saves = calls
            .map((c) => c.init?.body && JSON.parse(String(c.init.body)))
            .filter((b) => b?.action === 'save');
        expect(saves.map((b) => b.position)).toEqual([100, 104]);
    });

    it('sends the EPG fallback to epg.php in batches of 400 channels', async () => {
        const epgBodies: { channels: unknown[]; token: string }[] = [];
        global.fetch = jest.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
            const body = init?.body ? JSON.parse(String(init.body)) : null;
            if (body?.action === 'auth') return jsonResponse({ success: true, token: 'tok' });
            if (String(url).endsWith('epg.php')) {
                epgBodies.push(body);
                return jsonResponse({ epg: { [body.channels[0].id]: [{ s: 1, e: 2, t: 'x' }] } });
            }
            return jsonResponse(snapshot);
        }) as typeof fetch;
        const channels = Array.from({ length: 401 }, (_, i) => ({ id: String(i), name: `C${i}` }));
        const epg = await service().fetchFallbackEpg(channels, creds);
        expect(epgBodies.map((b) => b.channels.length)).toEqual([400, 1]);
        expect(epgBodies[0].token).toBe('tok');
        expect(Object.keys(epg)).toEqual(['0', '400']);
    });
});
