const values = new Map<string, unknown>();
const resolveHost = jest.fn();

jest.mock('electron', () => ({
    app: { configureHostResolver: jest.fn() },
    session: {
        defaultSession: {
            clearHostResolverCache: jest.fn(async () => undefined),
            resolveHost: (...args: unknown[]) => resolveHost(...args),
        },
    },
}));
jest.mock('./store.service', () => ({
    DNS_ROUTE: 'DNS_ROUTE',
    LEGACY_SECURE_DNS_MODE: 'SECURE_DNS_MODE',
    store: {
        get: jest.fn((key: string, fallback: unknown) => values.get(key) ?? fallback),
        set: jest.fn((key: string, value: unknown) => values.set(key, value)),
        delete: jest.fn((key: string) => values.delete(key)),
    },
}));

import { app } from 'electron';
import {
    getActiveDnsRoute,
    hostResolverOptions,
    getDnsChoice,
    initSmartDns,
    resetSmartDnsForTests,
    setDnsChoice,
    resolveHostnameSmart,
    withDnsFallback,
} from './smart-dns.service';

const configure = app.configureHostResolver as jest.Mock;
const dnsError = () => new Error('net::ERR_NAME_NOT_RESOLVED');
const lastServers = () => configure.mock.calls.at(-1)?.[0]?.secureDnsServers;

describe('smart DNS', () => {
    beforeEach(() => {
        values.clear();
        configure.mockClear();
        resolveHost.mockReset();
        resetSmartDnsForTests();
    });

    it('maps routes to Electron resolver options', () => {
        expect(hostResolverOptions('system')).toEqual({ secureDnsMode: 'automatic', secureDnsServers: [] });
        expect(hostResolverOptions('cloudflare')).toEqual({
            secureDnsMode: 'secure',
            secureDnsServers: ['https://cloudflare-dns.com/dns-query'],
        });
        expect(hostResolverOptions('google').secureDnsServers).toEqual(['https://dns.google/dns-query']);
    });

    it('starts with the DNS button provider, or the automatic route that worked', () => {
        values.set('SECURE_DNS_MODE', 'quad9');
        expect(initSmartDns()).toBe('quad9');
        expect(lastServers()).toEqual(['https://dns.quad9.net/dns-query']);

        values.set('SECURE_DNS_MODE', 'automatic');
        values.set('DNS_ROUTE', 'google');
        expect(initSmartDns()).toBe('google');
        expect(lastServers()).toEqual(['https://dns.google/dns-query']);

        values.set('DNS_ROUTE', 'bogus');
        expect(initSmartDns()).toBe('system');
    });

    it('DNS button: a provider stays fixed (no automatic switching); Automático restores the fallback', async () => {
        await expect(setDnsChoice('adguard')).resolves.toBe('adguard');
        expect(getDnsChoice()).toBe('adguard');
        expect(getActiveDnsRoute()).toBe('adguard');
        expect(lastServers()).toEqual(['https://dns.adguard-dns.com/dns-query']);
        await expect(withDnsFallback(async () => { throw dnsError(); })).rejects.toThrow('ERR_NAME_NOT_RESOLVED');
        expect(getActiveDnsRoute()).toBe('adguard');

        await expect(setDnsChoice('bogus' as never)).resolves.toBe('automatic');
        expect(getActiveDnsRoute()).toBe('system');
    });

    it('does not touch the resolver when the request works', async () => {
        await expect(withDnsFallback(async () => 'ok')).resolves.toBe('ok');
        expect(configure).not.toHaveBeenCalled();
        expect(values.has('DNS_ROUTE')).toBe(false);
    });

    it('retries a DNS failure over Cloudflare and remembers it', async () => {
        const task = jest.fn().mockRejectedValueOnce(dnsError()).mockResolvedValueOnce('ok');
        await expect(withDnsFallback(task)).resolves.toBe('ok');
        expect(task).toHaveBeenCalledTimes(2);
        expect(lastServers()).toEqual(['https://cloudflare-dns.com/dns-query']);
        expect(getActiveDnsRoute()).toBe('cloudflare');
        expect(values.get('DNS_ROUTE')).toBe('cloudflare');
    });

    it('goes on to Google when Cloudflare also fails', async () => {
        const task = jest
            .fn()
            .mockRejectedValueOnce(dnsError())
            .mockRejectedValueOnce(dnsError())
            .mockResolvedValueOnce('ok');
        await expect(withDnsFallback(task)).resolves.toBe('ok');
        expect(getActiveDnsRoute()).toBe('google');
        expect(values.get('DNS_ROUTE')).toBe('google');
    });

    it('restores the original route when no route works', async () => {
        const first = dnsError();
        const task = jest.fn().mockRejectedValueOnce(first).mockRejectedValue(dnsError());
        await expect(withDnsFallback(task)).rejects.toBe(first);
        expect(task).toHaveBeenCalledTimes(3);
        expect(getActiveDnsRoute()).toBe('system');
        expect(configure.mock.calls.at(-1)?.[0]).toEqual(hostResolverOptions('system'));
        expect(values.has('DNS_ROUTE')).toBe(false);
    });

    it('goes back to the system resolver when the remembered DoH route fails', async () => {
        values.set('DNS_ROUTE', 'cloudflare');
        initSmartDns();
        const task = jest.fn().mockRejectedValueOnce(dnsError()).mockResolvedValueOnce('ok');
        await expect(withDnsFallback(task)).resolves.toBe('ok');
        expect(getActiveDnsRoute()).toBe('system');
        expect(values.get('DNS_ROUTE')).toBe('system');
    });

    it('passes other errors through without switching', async () => {
        const error = new Error('net::ERR_INTERNET_DISCONNECTED');
        await expect(withDnsFallback(() => Promise.reject(error))).rejects.toBe(error);
        expect(configure).not.toHaveBeenCalled();
    });

    it('lets parallel failures share one switch', async () => {
        let calls = 0;
        const task = jest.fn(async () => {
            calls += 1;
            if (getActiveDnsRoute() === 'system') throw dnsError();
            return 'ok';
        });
        await expect(Promise.all([withDnsFallback(task), withDnsFallback(task)])).resolves.toEqual(['ok', 'ok']);
        expect(calls).toBe(4);
        expect(configure.mock.calls.filter(([o]) => o.secureDnsMode === 'secure')).toHaveLength(1);
    });

    describe('resolveHostnameSmart', () => {
        it('uses the system resolver on the system route', async () => {
            const system = jest.fn(async () => ['203.0.113.7']);
            await expect(resolveHostnameSmart('line.test', system)).resolves.toEqual(['203.0.113.7']);
            expect(resolveHost).not.toHaveBeenCalled();
        });

        it('falls back to DoH through Chromium when the system lookup fails', async () => {
            const system = jest.fn(async () => {
                throw Object.assign(new Error('getaddrinfo ENOTFOUND line.test'), { code: 'ENOTFOUND' });
            });
            resolveHost.mockImplementation(async () => {
                if (getActiveDnsRoute() === 'system') throw dnsError();
                return { endpoints: [{ address: '203.0.113.9', family: 'ipv4' }] };
            });
            await expect(resolveHostnameSmart('line.test', system)).resolves.toEqual(['203.0.113.9']);
            expect(resolveHost).toHaveBeenCalledWith('line.test');
            expect(values.get('DNS_ROUTE')).toBe('cloudflare');

            // Next lookups stay on the remembered DoH route.
            await resolveHostnameSmart('other.test', system);
            expect(system).toHaveBeenCalledTimes(1);
        });
    });
});
