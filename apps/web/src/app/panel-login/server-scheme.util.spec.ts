import { resolveReachableServer, withScheme } from './server-scheme.util';

describe('resolveReachableServer', () => {
    beforeEach(() => localStorage.clear());

    const probeOnly = (scheme: 'http' | 'https') =>
        jest.fn(async (url: string) => ({ status: url.startsWith(`${scheme}://`) ? 200 : 0 }));

    it('falls back to http when the panel gives https and only http answers', async () => {
        const probe = probeOnly('http');
        await expect(resolveReachableServer('https://iptv.test:8080', probe)).resolves.toBe('http://iptv.test:8080');
        expect(probe).toHaveBeenCalledTimes(2);
    });

    it('falls back to https when the line is http and only https answers', async () => {
        await expect(resolveReachableServer('http://iptv.test', probeOnly('https'))).resolves.toBe('https://iptv.test');
    });

    it('tries the remembered scheme first and moves on when it stopped answering', async () => {
        await resolveReachableServer('https://iptv.test', probeOnly('http'));
        const probe = probeOnly('https');
        await expect(resolveReachableServer('https://iptv.test', probe)).resolves.toBe('https://iptv.test');
        expect(probe.mock.calls.map(([url]) => url)).toEqual(['http://iptv.test/player_api.php', 'https://iptv.test/player_api.php']);
    });

    it('keeps the server as given when nothing answers or there is no probe', async () => {
        await expect(resolveReachableServer('https://iptv.test', probeOnly('ftp' as 'http'))).resolves.toBe('https://iptv.test');
        await expect(resolveReachableServer('https://iptv.test')).resolves.toBe('https://iptv.test');
    });

    it('drops the default https port when switching to http', () => {
        expect(withScheme('https://iptv.test:443/', 'http')).toBe('http://iptv.test/');
    });
});
