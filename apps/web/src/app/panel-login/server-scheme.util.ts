import { withScheme } from '@iptvnator/shared/interfaces';

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

// Shared with the players' http ↔ https stream retry (drops :443 / :80).
export { withScheme };

/** Same line server, whatever the scheme and trailing slash. */
export function sameServerHost(a?: string, b?: string): boolean {
    return hostKey(a ?? '') === hostKey(b ?? '');
}

/**
 * The panel can hand out the line's DNS as https:// (it rewrites http to
 * https when it is itself reached over https), but many Xtream providers only
 * answer on http (and a few only on https). Requests to a scheme the server
 * does not speak hang until ETIMEDOUT. Both schemes are tried, the remembered
 * one for the host first (if it stopped answering the other one is tried),
 * and the scheme that answers is remembered for the host.
 */
export async function resolveReachableServer(server: string, probe?: ProbeFn): Promise<string> {
    if (!/^https?:\/\//i.test(server) || !probe) return server;
    const given: 'http' | 'https' = /^https:\/\//i.test(server) ? 'https' : 'http';
    const first = remembered(server) ?? given;
    const order: ('http' | 'https')[] = [first, first === 'https' ? 'http' : 'https'];
    try {
        for (const scheme of order) {
            const candidate = withScheme(server, scheme);
            const answer = await probe(`${candidate.replace(/\/+$/, '')}/player_api.php`, 'GET');
            if (answer.status > 0) {
                remember(server, scheme);
                return candidate;
            }
        }
    } catch {
        // Probe unavailable: keep the DNS as the panel gave it.
    }
    return server;
}
