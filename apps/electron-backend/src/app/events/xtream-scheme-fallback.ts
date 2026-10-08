import axios from 'axios';

/** Network-level failures where the server never answered over TLS. */
const CONNECT_FAILURE_CODES = new Set([
    'ETIMEDOUT',
    'ECONNREFUSED',
    'ECONNRESET',
    'ECONNABORTED',
    'EHOSTUNREACH',
    'ENETUNREACH',
    'EPROTO',
    'ERR_SSL_WRONG_VERSION_NUMBER',
    'ERR_SSL_PROTOCOL_ERROR',
    'DEPTH_ZERO_SELF_SIGNED_CERT',
    'UNABLE_TO_VERIFY_LEAF_SIGNATURE',
    'CERT_HAS_EXPIRED',
    'ERR_TLS_CERT_ALTNAME_INVALID',
]);

/** Hosts whose https endpoint did not answer while http did (for this run). */
const plainHttpHosts = new Set<string>();

export function isConnectFailure(error: unknown): boolean {
    if (!axios.isAxiosError(error) || error.response) return false;
    const code = String(error.code ?? (error.cause as { code?: string } | undefined)?.code ?? '');
    return CONNECT_FAILURE_CODES.has(code) || /timeout/i.test(error.message);
}

/** The same URL over http (port 443 dropped), or null when it is not https. */
export function toPlainHttp(url: URL): URL | null {
    if (url.protocol !== 'https:') return null;
    const next = new URL(url.toString());
    next.protocol = 'http:';
    if (next.port === '443') next.port = '';
    return next;
}

/** Applies a scheme already known to work for this host. */
export function preferKnownScheme(url: URL): URL {
    return url.protocol === 'https:' && plainHttpHosts.has(url.hostname.toLowerCase())
        ? (toPlainHttp(url) ?? url)
        : url;
}

export function rememberPlainHttp(url: URL): void {
    plainHttpHosts.add(url.hostname.toLowerCase());
}

/** Test helper. */
export function resetSchemeFallback(): void {
    plainHttpHosts.clear();
}
