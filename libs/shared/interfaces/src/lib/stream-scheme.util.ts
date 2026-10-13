/**
 * Panel lines may live on http, https or both. When a stream fails, the
 * players retry the same URL once with the other scheme; a scheme that
 * worked is remembered for the host for the rest of the session (memory
 * only, cleared when the panel session/line changes), so the next streams
 * start with it.
 */
export type UrlScheme = 'http' | 'https';

const SCHEME_PATTERN = /^(https?):\/\//i;
const preferredSchemeByHost = new Map<string, UrlScheme>();

export function urlScheme(url: string): UrlScheme | null {
    const match = SCHEME_PATTERN.exec(url.trim());
    return match ? (match[1].toLowerCase() as UrlScheme) : null;
}

/**
 * Same URL with `scheme`. The default port of the scheme being left is
 * dropped (`https://host:443` → `http://host`, `http://host:80` →
 * `https://host`); any other port is kept.
 */
export function withScheme(url: string, scheme: UrlScheme): string {
    const switched = url.trim().replace(SCHEME_PATTERN, `${scheme}://`);
    const defaultPortToDrop = scheme === 'http' ? '443' : '80';
    return switched.replace(
        new RegExp(`^(${scheme}:\\/\\/[^/?#]+?):${defaultPortToDrop}(?=[/?#]|$)`, 'i'),
        '$1'
    );
}

/** The same URL on the other scheme, or null for non-http(s) URLs. */
export function otherSchemeUrl(url: string): string | null {
    const scheme = urlScheme(url);
    if (!scheme) {
        return null;
    }
    return withScheme(url, scheme === 'http' ? 'https' : 'http');
}

/** `host[:port]` without the scheme's default port, lower case. */
export function streamSchemeHostKey(url: string): string | null {
    if (!urlScheme(url)) {
        return null;
    }
    const authority = url
        .trim()
        .replace(SCHEME_PATTERN, '')
        .split(/[/?#]/)[0]
        .replace(/^[^@]*@/, '')
        .toLowerCase();
    return authority.replace(/:(80|443)$/, '') || null;
}

/** Remembers the scheme of a URL that played, for its host. */
export function rememberStreamScheme(url: string): void {
    const scheme = urlScheme(url);
    const host = streamSchemeHostKey(url);
    if (scheme && host) {
        preferredSchemeByHost.set(host, scheme);
    }
}

/** The URL on the scheme that worked earlier for its host (if any). */
export function applyPreferredStreamScheme(url: string): string {
    const host = streamSchemeHostKey(url);
    const preferred = host ? preferredSchemeByHost.get(host) : undefined;
    return preferred && preferred !== urlScheme(url)
        ? withScheme(url, preferred)
        : url;
}

/** Forgets the remembered schemes (new panel session or line). */
export function resetStreamSchemePreference(): void {
    preferredSchemeByHost.clear();
}
