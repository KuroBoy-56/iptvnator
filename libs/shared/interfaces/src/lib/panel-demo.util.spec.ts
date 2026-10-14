import {
    SESSION_DEMO_DURATION_KEY,
    SESSION_DEMO_EXPIRES_KEY,
    demoEndText,
    demoLength,
    demoLengthKey,
    sessionDemoExpires,
    setSessionDemo,
    setSessionDemoTimes,
} from './panel-demo.util';

// the project runs these specs in node: a small in-memory localStorage
const mem = new Map<string, string>();
Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
        getItem: (k: string) => (mem.has(k) ? (mem.get(k) as string) : null),
        setItem: (k: string, v: string) => void mem.set(k, String(v)),
        removeItem: (k: string) => void mem.delete(k),
        clear: () => mem.clear(),
    },
});

describe('panel demo times', () => {
    beforeEach(() => mem.clear());

    it('names the demo length the panel sends (never a fixed 24 hours)', () => {
        const key = (s: number) => {
            const length = demoLength(s);
            return length ? demoLengthKey(length) : null;
        };
        expect(key(3600)).toEqual({ key: 'MPX.DEMO.HOUR', params: { count: 1 } });
        expect(key(7200)).toEqual({ key: 'MPX.DEMO.HOURS', params: { count: 2 } });
        expect(key(14400)).toEqual({ key: 'MPX.DEMO.HOURS', params: { count: 4 } });
        expect(key(86400)).toEqual({ key: 'MPX.DEMO.DAY', params: { count: 1 } });
        expect(key(1800)).toEqual({ key: 'MPX.DEMO.MINUTES', params: { count: 30 } });
        expect(key(0)).toBeNull();
    });

    it('shows the panel end of the demo with the exact local time', () => {
        const end = new Date(2026, 9, 13, 18, 45).getTime() / 1000;
        expect(demoEndText(end)).toBe('13/10/2026 18:45');
        expect(demoEndText(0)).toBe('');
    });

    it('keeps the panel times while the demo is on and drops them with the demo', () => {
        setSessionDemo(true);
        setSessionDemoTimes(1_800_000_000, 7200);
        expect(sessionDemoExpires()).toBe(1_800_000_000);
        expect(demoLength()).toEqual({ unit: 'HOUR', count: 2 });
        setSessionDemo(false);
        expect(localStorage.getItem(SESSION_DEMO_EXPIRES_KEY)).toBeNull();
        expect(localStorage.getItem(SESSION_DEMO_DURATION_KEY)).toBeNull();
        expect(sessionDemoExpires()).toBe(0);
    });
});
