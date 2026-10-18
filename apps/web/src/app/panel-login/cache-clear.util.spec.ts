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

    it('stores the first order silently', () => {
        const listener = jest.fn();
        window.addEventListener(PANEL_CACHE_CLEAR_EVENT, listener);
        expect(applyCacheClearOrder(9)).toBe(false);
        expect(readCacheClearSeen()).toBe(9);
        expect(listener).not.toHaveBeenCalled();
        window.removeEventListener(PANEL_CACHE_CLEAR_EVENT, listener);
    });

    it('stores a newer order first, shows the notice and then restarts through the bridge', () => {
        jest.useFakeTimers();
        const restart = jest.fn(async () => undefined);
        Object.defineProperty(window, 'electron', { configurable: true, value: { panelClearCacheAndRestart: restart } });
        const listener = jest.fn();
        window.addEventListener(PANEL_CACHE_CLEAR_EVENT, listener);
        localStorage.setItem(CACHE_CLEAR_SEEN_KEY, '2');

        expect(applyCacheClearOrder(3)).toBe(true);
        expect(readCacheClearSeen()).toBe(3);
        expect(listener).toHaveBeenCalledTimes(1);
        expect(restart).not.toHaveBeenCalled();
        jest.advanceTimersByTime(3000);
        expect(restart).toHaveBeenCalledTimes(1);
        // the same order again: nothing
        expect(applyCacheClearOrder(3)).toBe(false);

        window.removeEventListener(PANEL_CACHE_CLEAR_EVENT, listener);
        delete (window as unknown as { electron?: unknown }).electron;
    });
});
