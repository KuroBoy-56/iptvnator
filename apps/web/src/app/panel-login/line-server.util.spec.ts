import type { PortalStatus } from '@iptvnator/services';
import { pickLineServer } from './line-server.util';

const SERVERS = ['http://a.test', 'http://b.test', 'http://c.test'];

function checker(statuses: Record<string, PortalStatus | Error>) {
    return jest.fn((server: string) => {
        const value = statuses[server];
        return value instanceof Error ? Promise.reject(value) : Promise.resolve(value);
    });
}

describe('pickLineServer', () => {
    it('uses the only server without probing', async () => {
        const check = jest.fn();
        await expect(pickLineServer(['http://a.test'], check)).resolves.toBe('http://a.test');
        await expect(pickLineServer([], check)).resolves.toBeNull();
        expect(check).not.toHaveBeenCalled();
    });

    it('picks the server where the line is active', async () => {
        const check = checker({
            'http://a.test': 'inactive',
            'http://b.test': new Error('ENOTFOUND'),
            'http://c.test': 'active',
        });
        await expect(pickLineServer(SERVERS, check)).resolves.toBe('http://c.test');
        expect(check).toHaveBeenCalledTimes(3);
    });

    it('prefers an expired account over the first server', async () => {
        const check = checker({
            'http://a.test': 'unavailable',
            'http://b.test': 'expired',
            'http://c.test': 'inactive',
        });
        await expect(pickLineServer(SERVERS, check)).resolves.toBe('http://b.test');
    });

    it('falls back to the first server when no probe recognizes the line', async () => {
        const check = checker({
            'http://a.test': 'inactive',
            'http://b.test': 'unavailable',
            'http://c.test': new Error('timeout'),
        });
        await expect(pickLineServer(SERVERS, check)).resolves.toBe('http://a.test');
    });

    it('does not wait for a hanging server once one is active', async () => {
        const check = jest.fn((server: string) =>
            server === 'http://b.test'
                ? Promise.resolve<PortalStatus>('active')
                : new Promise<PortalStatus>(() => undefined)
        );
        await expect(pickLineServer(SERVERS, check)).resolves.toBe('http://b.test');
    });

    it('stops waiting after the timeout', async () => {
        jest.useFakeTimers();
        try {
            const check = jest.fn(() => new Promise<PortalStatus>(() => undefined));
            const picked = pickLineServer(SERVERS, check, 1000);
            jest.advanceTimersByTime(1000);
            await expect(picked).resolves.toBe('http://a.test');
        } finally {
            jest.useRealTimers();
        }
    });
});
