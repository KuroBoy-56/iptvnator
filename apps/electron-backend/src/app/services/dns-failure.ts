/**
 * Classifies network errors for the automatic DNS fallback
 * (smart-dns.service.ts). Works for Node errors (dns.lookup, axios) and
 * Chromium errors (net.fetch, session.resolveHost), whose codes only appear
 * in the message ("net::ERR_NAME_NOT_RESOLVED").
 */

/** Name resolution failed or timed out (Node / c-ares codes). */
const NODE_DNS_CODES = new Set([
    'ENOTFOUND',
    'EAI_AGAIN',
    'EAI_FAIL',
    'EAI_NONAME',
    'EAI_NODATA',
    'ENODATA',
    'ESERVFAIL',
    'ETIMEOUT',
]);

/** Connection cut right away: typical of an ISP DNS that hijacks a blocked host. */
const NODE_BLOCKED_CODES = new Set(['ECONNREFUSED', 'ECONNRESET']);

const CHROMIUM_DNS = /ERR_(NAME_NOT_RESOLVED|NAME_RESOLUTION_FAILED|DNS_[A-Z_]+)/;
const CHROMIUM_BLOCKED =
    /ERR_(CONNECTION_REFUSED|CONNECTION_RESET|CONNECTION_CLOSED|ADDRESS_UNREACHABLE)/;

interface ErrorLike {
    code?: unknown;
    message?: unknown;
    cause?: unknown;
    response?: unknown;
}

/** Codes and messages of an error and its causes (max. 4 levels). */
function errorParts(error: unknown): { codes: string[]; text: string } {
    const codes: string[] = [];
    const messages: string[] = [];
    let current: unknown = error;
    for (let depth = 0; depth < 4 && current; depth += 1) {
        if (typeof current === 'string') {
            messages.push(current);
            break;
        }
        if (typeof current !== 'object') break;
        const value = current as ErrorLike;
        if (typeof value.code === 'string') codes.push(value.code);
        if (typeof value.message === 'string') messages.push(value.message);
        current = value.cause;
    }
    return { codes, text: messages.join(' ') };
}

/** An HTTP answer arrived, so DNS and the connection worked. */
function hasResponse(error: unknown): boolean {
    return Boolean(
        error && typeof error === 'object' && (error as ErrorLike).response
    );
}

/** The host name could not be resolved (or resolution timed out). */
export function isDnsResolutionFailure(error: unknown): boolean {
    if (hasResponse(error)) return false;
    const { codes, text } = errorParts(error);
    return (
        codes.some((code) => NODE_DNS_CODES.has(code)) ||
        CHROMIUM_DNS.test(text) ||
        codes.some((code) => CHROMIUM_DNS.test(code))
    );
}

/**
 * Worth retrying with another DNS route: a resolution failure, or a
 * connection refused/reset right away, which is how many ISP resolvers
 * block a host (they answer with an address that does not serve it).
 */
export function shouldTryAnotherDnsRoute(error: unknown): boolean {
    if (hasResponse(error)) return false;
    if (isDnsResolutionFailure(error)) return true;
    const { codes, text } = errorParts(error);
    return (
        codes.some((code) => NODE_BLOCKED_CODES.has(code)) ||
        CHROMIUM_BLOCKED.test(text)
    );
}
