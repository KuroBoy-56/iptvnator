jest.mock('electron', () => ({ app: { configureHostResolver: jest.fn() } }));
jest.mock('../services/store.service', () => {
    const values = new Map<string, unknown>();
    return {
        SECURE_DNS_MODE: 'SECURE_DNS_MODE',
        store: {
            get: jest.fn((key: string, fallback: unknown) => values.get(key) ?? fallback),
            set: jest.fn((key: string, value: unknown) => values.set(key, value)),
        },
    };
});

import { app } from 'electron';
import { applySecureDns, getSecureDnsMode, hostResolverOptions } from './secure-dns.service';

describe('secure DNS', () => {
    it('maps each choice to Electron resolver options', () => {
        expect(hostResolverOptions('automatic')).toEqual({ secureDnsMode: 'automatic', secureDnsServers: [] });
        expect(hostResolverOptions('adguard')).toEqual({
            secureDnsMode: 'secure',
            secureDnsServers: ['https://dns.adguard-dns.com/dns-query'],
        });
    });

    it('applies and persists the choice', () => {
        expect(applySecureDns('quad9')).toBe('quad9');
        expect(app.configureHostResolver).toHaveBeenCalledWith({
            secureDnsMode: 'secure',
            secureDnsServers: ['https://dns.quad9.net/dns-query'],
        });
        expect(getSecureDnsMode()).toBe('quad9');
    });

    it('falls back to automatic for unknown values', () => {
        expect(applySecureDns('bogus' as never)).toBe('automatic');
    });
});
