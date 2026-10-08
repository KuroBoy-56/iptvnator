import { AxiosError } from 'axios';
import {
    isConnectFailure,
    preferKnownScheme,
    rememberPlainHttp,
    resetSchemeFallback,
    toPlainHttp,
} from './xtream-scheme-fallback';

describe('xtream scheme fallback', () => {
    afterEach(() => resetSchemeFallback());

    it('detects connection failures but not HTTP answers', () => {
        expect(isConnectFailure(new AxiosError('connect ETIMEDOUT 159.198.67.192:443', 'ETIMEDOUT'))).toBe(true);
        expect(isConnectFailure(new AxiosError('refused', 'ECONNREFUSED'))).toBe(true);
        const answered = new AxiosError('bad', 'ERR_BAD_RESPONSE', undefined, undefined, {
            status: 403,
        } as never);
        expect(isConnectFailure(answered)).toBe(false);
        expect(isConnectFailure(new Error('x'))).toBe(false);
    });

    it('rewrites https to http and remembers the host', () => {
        const url = new URL('https://latammx.net:443/player_api.php?username=u&password=p');
        expect(toPlainHttp(url)?.toString()).toBe('http://latammx.net/player_api.php?username=u&password=p');
        expect(toPlainHttp(new URL('http://a.b/x'))).toBeNull();

        expect(preferKnownScheme(url).protocol).toBe('https:');
        rememberPlainHttp(url);
        expect(preferKnownScheme(new URL('https://LATAMMX.net/player_api.php')).toString()).toBe(
            'http://latammx.net/player_api.php'
        );
    });
});
