const STORAGE_PREFIX = 'panel_server_scheme:';

type ProbeFn = (url: string, method?: 'GET' | 'HEAD') => Promise<{ status: number }>;

function hostKey(server: string): string {
    return server.replace(/^https?:\/\//i, '').replace(/\/+$/, '').toLowerCase();
}

function remembered(server: string): 'http' | 'https' | null {
    try {
        const value = localStorage.getItem(STORAGE_PREFIX + hostKey(server));
        return value === 'http' || value === 'https' ? value : null;
    } catch {
        return null;
    }
}

function remember(server: string, scheme: 'http' | 'https'): void {
    try {
        localStorage.setItem(STORAGE_PREFIX + hostKey(server), scheme);
    } catch {
        // Storage unavailable: the probe runs again next time.
    }
}

export function withScheme(server: string, scheme: 'http' | 'https'): string {
    return server.replace(/^https?:\/\//i, `${scheme}://`).replace(/^(http:\/\/[^/]+):443(?=\/|$)/i, '$1');
}

/** Same line server, whatever the scheme and trailing slash. */
export function sameServerHost(a?: string, b?: string): boolean {
    return hostKey(a ?? '') === hostKey(b ?? '');
}

/**
 * The panel can hand out the line's DNS as https:// (it rewrites http to
 * https when it is itself reached over https), but many Xtream providers only
 * answer on http. Requests to https://host:443 then hang until ETIMEDOUT.
 * When an https server does not answer, http on the same host is tried and
 * the working scheme is remembered for the host.
 */
export async function resolveReachableServer(server: string, probe?: ProbeFn): Promise<string> {
    if (!/^https:\/\//i.test(server) || !probe) return server;
    const known = remembered(server);
    if (known) return withScheme(server, known);
    const base = server.replace(/\/+$/, '');
    try {
        const secure = await probe(`${base}/player_api.php`, 'GET');
        if (secure.status > 0) {
            remember(server, 'https');
            return server;
        }
        const plain = withScheme(server, 'http');
        const fallback = await probe(`${plain.replace(/\/+$/, '')}/player_api.php`, 'GET');
        if (fallback.status > 0) {
            remember(server, 'http');
            return plain;
        }
    } catch {
        // Probe unavailable: keep the DNS as the panel gave it.
    }
    return server;
}
