import { panelEndpoint } from '@iptvnator/shared/interfaces';

/**
 * Hosts whose TLS certificate is always verified, even though IPTV provider
 * servers (often self-signed or expired) keep being accepted: the panel (it
 * carries the line, the device id and the tokens) and the public APIs the
 * app talks to.
 */
const STRICT_HOST_SUFFIXES: readonly string[] = [
    'themoviedb.org',
    'tmdb.org',
    'cloudflare-dns.com',
    'dns.google',
    'github.com',
    'githubusercontent.com',
    'googleapis.com',
    'youtube.com',
    'ytimg.com',
];

let cachedPanelHost: string | null = null;

export function panelHost(): string {
    if (cachedPanelHost === null) {
        try {
            cachedPanelHost = new URL(panelEndpoint('login.php')).hostname.toLowerCase();
        } catch {
            cachedPanelHost = '';
        }
    }
    return cachedPanelHost;
}

function matches(host: string, suffix: string): boolean {
    return host === suffix || host.endsWith('.' + suffix);
}

/** true when an invalid certificate for this host must be rejected */
export function requiresValidCertificate(hostname: string, panel = panelHost()): boolean {
    const host = hostname.trim().toLowerCase().replace(/^\[|\]$/g, '').replace(/\.$/, '');
    if (!host) return false;
    if (panel && matches(host, panel)) return true;
    return STRICT_HOST_SUFFIXES.some((s) => matches(host, s));
}

export function hostOf(url: string): string {
    try {
        return new URL(url).hostname;
    } catch {
        return '';
    }
}
