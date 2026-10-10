const handlers = new Map<string, (...args: unknown[]) => unknown>();
const netFetch = jest.fn();

jest.mock('electron', () => ({
    app: { configureHostResolver: jest.fn() },
    ipcMain: { handle: jest.fn((channel: string, fn: (...args: unknown[]) => unknown) => handlers.set(channel, fn)) },
    net: { fetch: (...args: unknown[]) => netFetch(...args) },
    session: { defaultSession: { clearHostResolverCache: jest.fn(async () => undefined) } },
}));
jest.mock('../services/store.service', () => {
    const values = new Map<string, unknown>([['SECURE_DNS_MODE', 'adguard']]);
    return {
        DNS_ROUTE: 'DNS_ROUTE',
        LEGACY_SECURE_DNS_MODE: 'SECURE_DNS_MODE',
        store: {
            get: jest.fn((key: string, fallback: unknown) => values.get(key) ?? fallback),
            set: jest.fn((key: string, value: unknown) => values.set(key, value)),
            delete: jest.fn((key: string) => values.delete(key)),
        },
    };
});
jest.mock('./device-id', () => ({ getDeviceId: jest.fn(async () => 'AA:BB:CC:DD:EE:FF:00:11') }));
jest.mock('./panel-master-key', () => ({ loadPanelMasterKey: () => Buffer.alloc(32, 1) }));

import { app } from 'electron';
import { store } from '../services/store.service';
import PanelEvents, { PANEL_LOGIN_REQUEST } from './panel.events';

describe('PanelEvents', () => {
    beforeAll(() => PanelEvents.bootstrapPanelEvents());

    it('registers no DNS picker channels and drops the old manual choice', () => {
        expect([...handlers.keys()].sort()).toEqual(['PANEL_GET_DEVICE_ID', PANEL_LOGIN_REQUEST]);
        expect(store.delete).toHaveBeenCalledWith('SECURE_DNS_MODE');
        expect(app.configureHostResolver).toHaveBeenCalledWith({ secureDnsMode: 'automatic', secureDnsServers: [] });
    });

    it('retries a panel login over DNS-over-HTTPS after a DNS failure', async () => {
        netFetch
            .mockRejectedValueOnce(new Error('net::ERR_NAME_NOT_RESOLVED'))
            .mockResolvedValueOnce({ status: 200, text: async () => '{"exists":false}' });

        const result = await handlers.get(PANEL_LOGIN_REQUEST)?.({}, 'check_mac');

        expect(result).toEqual({ ok: true, status: 200, data: { exists: false } });
        expect(netFetch).toHaveBeenCalledTimes(2);
        expect(app.configureHostResolver).toHaveBeenLastCalledWith({
            secureDnsMode: 'secure',
            secureDnsServers: ['https://cloudflare-dns.com/dns-query'],
        });
        expect(store.set).toHaveBeenCalledWith('DNS_ROUTE', 'cloudflare');
    });
});
