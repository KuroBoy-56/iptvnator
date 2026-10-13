import {
    applyPreferredStreamScheme,
    otherSchemeUrl,
    rememberStreamScheme,
    resetStreamSchemePreference,
    streamSchemeHostKey,
    withScheme,
} from './stream-scheme.util';

describe('stream scheme util', () => {
    afterEach(() => resetStreamSchemePreference());

    it('switches the scheme and drops the default port being left', () => {
        expect(withScheme('https://iptv.test:443/movie/u/p/1.mkv', 'http')).toBe(
            'http://iptv.test/movie/u/p/1.mkv'
        );
        expect(withScheme('http://iptv.test:80/live/u/p/2.ts', 'https')).toBe(
            'https://iptv.test/live/u/p/2.ts'
        );
        expect(withScheme('http://iptv.test:8080/live/1.m3u8', 'https')).toBe(
            'https://iptv.test:8080/live/1.m3u8'
        );
        expect(withScheme('HTTPS://iptv.test:4433', 'http')).toBe(
            'http://iptv.test:4433'
        );
    });

    it('gives the other-scheme URL only for http(s)', () => {
        expect(otherSchemeUrl('http://iptv.test:80/a.ts?x=1')).toBe(
            'https://iptv.test/a.ts?x=1'
        );
        expect(otherSchemeUrl('https://iptv.test/a.ts')).toBe(
            'http://iptv.test/a.ts'
        );
        expect(otherSchemeUrl('rtmp://iptv.test/live')).toBeNull();
        expect(otherSchemeUrl('/local/file.mkv')).toBeNull();
    });

    it('keys hosts without scheme, default port or credentials', () => {
        expect(streamSchemeHostKey('http://IPTV.test:80/a')).toBe('iptv.test');
        expect(streamSchemeHostKey('https://iptv.test/a')).toBe('iptv.test');
        expect(streamSchemeHostKey('https://u:p@iptv.test:8443/a')).toBe(
            'iptv.test:8443'
        );
        expect(streamSchemeHostKey('file:///a.mkv')).toBeNull();
    });

    it('starts later streams of the host on the scheme that worked, until reset', () => {
        rememberStreamScheme('https://iptv.test/movie/1.mkv');

        expect(applyPreferredStreamScheme('http://iptv.test:80/live/2.ts')).toBe(
            'https://iptv.test/live/2.ts'
        );
        expect(applyPreferredStreamScheme('https://iptv.test/live/3.ts')).toBe(
            'https://iptv.test/live/3.ts'
        );
        expect(applyPreferredStreamScheme('http://other.test/live/4.ts')).toBe(
            'http://other.test/live/4.ts'
        );

        resetStreamSchemePreference();
        expect(applyPreferredStreamScheme('http://iptv.test/live/2.ts')).toBe(
            'http://iptv.test/live/2.ts'
        );
    });
});
