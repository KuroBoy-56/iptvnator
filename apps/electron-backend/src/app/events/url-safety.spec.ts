import {
    assertRemoteUrlAllowed,
    isPrivateOrReservedIp,
    isPrivateNetworkUrlAccessAllowed,
    setDefaultHostnameResolver,
    UnsafeUrlError,
    validateRemoteUrl,
} from './url-safety';

describe('url-safety', () => {
    describe('isPrivateOrReservedIp', () => {
        it.each([
            '127.0.0.1',
            '10.0.0.5',
            '192.168.1.1',
            '172.16.0.1',
            '169.254.169.254',
            '::1',
            'fd00::1',
            'fe80::1',
            'febf::1',
            '::ffff:127.0.0.1',
            '::ffff:7f00:1',
            '::ffff:c0a8:101',
        ])('flags %s as private/reserved', (ip) => {
            expect(isPrivateOrReservedIp(ip)).toBe(true);
        });

        it.each(['93.184.216.34', '8.8.8.8', '1.1.1.1'])(
            'allows public address %s',
            (ip) => {
                expect(isPrivateOrReservedIp(ip)).toBe(false);
            }
        );
    });

    describe('assertRemoteUrlAllowed', () => {
        const publicResolver = async () => ['93.184.216.34'];

        it('rejects non-http(s) protocols', async () => {
            await expect(
                assertRemoteUrlAllowed('file:///etc/passwd')
            ).rejects.toBeInstanceOf(UnsafeUrlError);
        });

        it('rejects embedded credentials', async () => {
            await expect(
                assertRemoteUrlAllowed('http://user:pass@example.com', {
                    resolveHostname: publicResolver,
                })
            ).rejects.toBeInstanceOf(UnsafeUrlError);
        });

        it('rejects loopback literal', async () => {
            await expect(
                assertRemoteUrlAllowed('http://127.0.0.1/admin')
            ).rejects.toBeInstanceOf(UnsafeUrlError);
        });

        it('rejects localhost hostname', async () => {
            await expect(
                assertRemoteUrlAllowed('http://localhost:8080')
            ).rejects.toBeInstanceOf(UnsafeUrlError);
        });

        it('rejects the cloud metadata address', async () => {
            await expect(
                assertRemoteUrlAllowed(
                    'http://169.254.169.254/latest/meta-data'
                )
            ).rejects.toBeInstanceOf(UnsafeUrlError);
        });

        it('rejects hex-form IPv4-mapped IPv6 loopback literals', async () => {
            await expect(
                assertRemoteUrlAllowed('http://[::ffff:7f00:1]/admin')
            ).rejects.toBeInstanceOf(UnsafeUrlError);
        });

        it('rejects a hostname that resolves to a private IP', async () => {
            await expect(
                assertRemoteUrlAllowed('http://rebind.example', {
                    resolveHostname: async () => ['10.0.0.1'],
                })
            ).rejects.toBeInstanceOf(UnsafeUrlError);
        });

        it('allows a public URL', async () => {
            const target = await validateRemoteUrl(
                'https://example.com/playlist.m3u',
                { resolveHostname: publicResolver }
            );
            expect(target.url.hostname).toBe('example.com');
            expect(target.addresses).toEqual(['93.184.216.34']);
        });

        it('honors the allowPrivateNetworks override', async () => {
            const url = await assertRemoteUrlAllowed('http://127.0.0.1/probe', {
                allowPrivateNetworks: true,
            });
            expect(url.hostname).toBe('127.0.0.1');
        });
    });

    describe('setDefaultHostnameResolver', () => {
        afterEach(() => setDefaultHostnameResolver(null));

        it('resolves through the installed resolver when the policy has none', async () => {
            const resolver = jest.fn(async () => ['93.184.216.34']);
            setDefaultHostnameResolver(resolver);

            await expect(
                validateRemoteUrl('https://line.example/player_api.php')
            ).resolves.toMatchObject({ addresses: ['93.184.216.34'] });
            expect(resolver).toHaveBeenCalledWith('line.example');
        });

        it('lets an explicit policy resolver win', async () => {
            const installed = jest.fn(async () => ['93.184.216.34']);
            setDefaultHostnameResolver(installed);

            await validateRemoteUrl('https://line.example/', {
                resolveHostname: async () => ['1.1.1.1'],
            });
            expect(installed).not.toHaveBeenCalled();
        });
    });

    describe('isPrivateNetworkUrlAccessAllowed', () => {
        const originalValue = process.env.IPTVNATOR_ALLOW_PRIVATE_NETWORK_URLS;

        afterEach(() => {
            if (originalValue === undefined) {
                delete process.env.IPTVNATOR_ALLOW_PRIVATE_NETWORK_URLS;
            } else {
                process.env.IPTVNATOR_ALLOW_PRIVATE_NETWORK_URLS =
                    originalValue;
            }
        });

        it('requires an explicit environment opt-in', () => {
            delete process.env.IPTVNATOR_ALLOW_PRIVATE_NETWORK_URLS;
            expect(isPrivateNetworkUrlAccessAllowed()).toBe(false);

            process.env.IPTVNATOR_ALLOW_PRIVATE_NETWORK_URLS = ' TRUE ';
            expect(isPrivateNetworkUrlAccessAllowed()).toBe(true);
        });
    });
});
