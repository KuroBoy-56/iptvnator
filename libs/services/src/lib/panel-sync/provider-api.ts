import { SyncUserCredentials } from './panel-sync.types';

type XtreamBridge = {
    xtreamRequest?: (payload: {
        url: string;
        params: Record<string, string>;
        suppressErrorLog?: boolean;
    }) => Promise<{ payload: unknown }>;
};

/**
 * GET against the user's provider player_api.php. In Electron it goes through
 * the main-process Xtream bridge (no CORS, same DNS/TLS handling as the rest of
 * the app); in the browser it falls back to a plain fetch.
 */
export async function providerApiGet(
    creds: SyncUserCredentials,
    params: Record<string, string>,
    fetchFn: typeof fetch = (...args) => fetch(...args)
): Promise<unknown> {
    const server = creds.server?.trim().replace(/\/+$/, '');
    if (!server || !creds.username || !creds.password) return null;
    const all = { username: creds.username, password: creds.password, ...params };
    const bridge = (globalThis as { electron?: XtreamBridge }).electron;
    try {
        if (bridge?.xtreamRequest) {
            const res = await bridge.xtreamRequest({
                url: server,
                params: all,
                suppressErrorLog: true,
            });
            return res?.payload ?? null;
        }
        const query = new URLSearchParams(all).toString();
        const res = await fetchFn(`${server}/player_api.php?${query}`);
        return res.ok ? await res.json() : null;
    } catch {
        return null;
    }
}
