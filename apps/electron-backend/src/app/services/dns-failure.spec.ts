import { isDnsResolutionFailure, shouldTryAnotherDnsRoute } from './dns-failure';

function nodeError(code: string): NodeJS.ErrnoException {
    return Object.assign(new Error(`getaddrinfo ${code} line.test`), { code });
}

describe('dns-failure', () => {
    it.each(['ENOTFOUND', 'EAI_AGAIN', 'ESERVFAIL', 'ETIMEOUT'])(
        'treats Node %s as a DNS failure',
        (code) => {
            expect(isDnsResolutionFailure(nodeError(code))).toBe(true);
            expect(shouldTryAnotherDnsRoute(nodeError(code))).toBe(true);
        }
    );

    it.each([
        'net::ERR_NAME_NOT_RESOLVED',
        'net::ERR_NAME_RESOLUTION_FAILED',
        'net::ERR_DNS_TIMED_OUT',
    ])('treats Chromium %s as a DNS failure', (message) => {
        expect(isDnsResolutionFailure(new Error(message))).toBe(true);
    });

    it('finds the code in a nested cause (fetch TypeError)', () => {
        const error = Object.assign(new TypeError('fetch failed'), { cause: nodeError('ENOTFOUND') });
        expect(isDnsResolutionFailure(error)).toBe(true);
    });

    it('retries refused/reset connections (ISP DNS block) but not as DNS failures', () => {
        expect(isDnsResolutionFailure(nodeError('ECONNREFUSED'))).toBe(false);
        expect(shouldTryAnotherDnsRoute(nodeError('ECONNREFUSED'))).toBe(true);
        expect(shouldTryAnotherDnsRoute(new Error('net::ERR_CONNECTION_RESET'))).toBe(true);
    });

    it('ignores errors that are not about DNS', () => {
        expect(shouldTryAnotherDnsRoute(new Error('net::ERR_INTERNET_DISCONNECTED'))).toBe(false);
        expect(shouldTryAnotherDnsRoute(new Error('Unexpected token < in JSON'))).toBe(false);
        expect(shouldTryAnotherDnsRoute(undefined)).toBe(false);
        // An HTTP answer means the host resolved.
        expect(
            shouldTryAnotherDnsRoute(
                Object.assign(nodeError('ENOTFOUND'), { response: { status: 404 } })
            )
        ).toBe(false);
    });
});
