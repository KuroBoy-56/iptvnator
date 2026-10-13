import {
    SESSION_DEMO_DURATION_KEY,
    SESSION_DEMO_EXPIRES_KEY,
    demoEndText,
    demoLengthText,
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
        expect(demoLengthText(3600)).toBe('1 hora');
        expect(demoLengthText(7200)).toBe('2 horas');
        expect(demoLengthText(14400)).toBe('4 horas');
        expect(demoLengthText(86400)).toBe('1 día');
        expect(demoLengthText(1800)).toBe('30 minutos');
        expect(demoLengthText(0)).toBe('');
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
        expect(demoLengthText()).toBe('2 horas');
        setSessionDemo(false);
        expect(localStorage.getItem(SESSION_DEMO_EXPIRES_KEY)).toBeNull();
        expect(localStorage.getItem(SESSION_DEMO_DURATION_KEY)).toBeNull();
        expect(sessionDemoExpires()).toBe(0);
    });
});
