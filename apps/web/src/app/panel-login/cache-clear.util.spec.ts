import { markPlaybackOpen } from '@iptvnator/shared/interfaces';
import {
    applyCacheClearOrder,
    CACHE_CLEAR_SEEN_KEY,
    cacheClearAction,
    PANEL_CACHE_CLEAR_EVENT,
    readCacheClearSeen,
} from './cache-clear.util';

describe('cache clear order (check_mac cache_clear)', () => {
    afterEach(() => {
        localStorage.removeItem(CACHE_CLEAR_SEEN_KEY);
        jest.useRealTimers();
    });

    it('decides: nothing stored -> silent, greater -> clear, equal/lower/absent -> nothing', () => {
        expect(cacheClearAction(null, 4)).toBe('remember');
        expect(cacheClearAction(null, 0)).toBe('remember');
        expect(cacheClearAction(3, 4)).toBe('clear');
        expect(cacheClearAction(4, 4)).toBe('none');
        expect(cacheClearAction(5, 4)).toBe('none');
        expect(cacheClearAction(5, undefined)).toBe('none');
        expect(cacheClearAction(null, undefined)).toBe('none');
    });

    it('nothing stored: an order sent in the last 3 days clears (reinstalled app), an older one is only stored', () => {
        const now = 1_800_000_000;
        expect(cacheClearAction(null, 4, now - 3600, now)).toBe('clear');
        expect(cacheClearAction(null, 4, now - 4 * 86400, now)).toBe('remember');
        expect(cacheClearAction(null, 0, now - 60, now)).toBe('remember');
        expect(cacheClearAction(null, 4, 0, now)).toBe('remember');
        expect(cacheClearAction(4, 4, now - 60, now)).toBe('none');
    });

    it('stores the first order silently', () => {
        const listener = jest.fn();
        window.addEventListener(PANEL_CACHE_CLEAR_EVENT, listener);
        expect(applyCacheClearOrder(9)).toBe(false);
        expect(readCacheClearSeen()).toBe(9);
        expect(listener).not.toHaveBeenCalled();
        window.removeEventListener(PANEL_CACHE_CLEAR_EVENT, listener);
    });

    it('stores a newer order first, shows the notice and then restarts through the bridge', async () => {
        jest.useFakeTimers();
        const restart = jest.fn(async () => undefined);
        Object.defineProperty(window, 'electron', { configurable: true, value: { panelClearCacheAndRestart: restart } });
        const listener = jest.fn();
        window.addEventListener(PANEL_CACHE_CLEAR_EVENT, listener);
        localStorage.setItem(CACHE_CLEAR_SEEN_KEY, '2');

        expect(applyCacheClearOrder(3)).toBe(true);
        expect(readCacheClearSeen()).toBe(3);
        await Promise.resolve();
        expect(listener).toHaveBeenCalledTimes(1);
        expect(restart).not.toHaveBeenCalled();
        jest.advanceTimersByTime(3000);
        expect(restart).toHaveBeenCalledTimes(1);
        // the same order again: nothing
        expect(applyCacheClearOrder(3)).toBe(false);

        window.removeEventListener(PANEL_CACHE_CLEAR_EVENT, listener);
        delete (window as unknown as { electron?: unknown }).electron;
    });

    it('waits until the open video is closed', async () => {
        jest.useFakeTimers();
        const restart = jest.fn(async () => undefined);
        Object.defineProperty(window, 'electron', { configurable: true, value: { panelClearCacheAndRestart: restart } });
        const listener = jest.fn();
        window.addEventListener(PANEL_CACHE_CLEAR_EVENT, listener);
        localStorage.setItem(CACHE_CLEAR_SEEN_KEY, '2');
        const close = markPlaybackOpen();

        expect(applyCacheClearOrder(3)).toBe(true);
        await Promise.resolve();
        jest.advanceTimersByTime(10_000);
        expect(listener).not.toHaveBeenCalled();
        expect(restart).not.toHaveBeenCalled();
        close();
        await Promise.resolve();
        await Promise.resolve();
        expect(listener).toHaveBeenCalledTimes(1);
        jest.advanceTimersByTime(3000);
        expect(restart).toHaveBeenCalledTimes(1);

        window.removeEventListener(PANEL_CACHE_CLEAR_EVENT, listener);
        delete (window as unknown as { electron?: unknown }).electron;
    });
});
