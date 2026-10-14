/**
 * Demo line in use (the "Autodemo" button, or the panel says `"demo": true` in check_mac /
 * auto_demo / progress.php). While it is on, the app shows "DEMO" instead of the line's user and
 * password and keeps no progress ("Continuar viendo") nor favorites ("Mi lista").
 */
export const SESSION_DEMO_KEY = 'session_demo';
/** End of the demo as the panel says (`demo_expires`, unix seconds) and its length (`demo_duration`, seconds). */
export const SESSION_DEMO_EXPIRES_KEY = 'session_demo_expires';
export const SESSION_DEMO_DURATION_KEY = 'session_demo_duration';
export const DEMO_LABEL = 'DEMO';
/** Translation key of the notice shown when a demo tries to save progress or favorites. */
export const DEMO_BLOCKED_MESSAGE = 'MPX.DEMO.BLOCKED';
/** Fired on window when the demo flag changes. */
export const PANEL_DEMO_EVENT = 'panel-demo-changed';
/** Fired on window when a demo user tries something a demo cannot do (the shell shows a notice). */
export const PANEL_DEMO_BLOCKED_EVENT = 'panel-demo-blocked';

export function isSessionDemo(): boolean {
    try {
        return localStorage.getItem(SESSION_DEMO_KEY) === '1';
    } catch {
        return false;
    }
}

export function setSessionDemo(on: boolean): void {
    try {
        if (on === isSessionDemo()) return;
        if (on) localStorage.setItem(SESSION_DEMO_KEY, '1');
        else {
            localStorage.removeItem(SESSION_DEMO_KEY);
            localStorage.removeItem(SESSION_DEMO_EXPIRES_KEY);
            localStorage.removeItem(SESSION_DEMO_DURATION_KEY);
        }
        // the screens that already read the per-playlist flag (account info, details) see it too
        const token = localStorage.getItem('session_token') ?? '';
        const id = token.startsWith('panel-') ? token.slice(6) : '';
        if (id) {
            if (on) localStorage.setItem(`is_demo_${id}`, 'true');
            else localStorage.removeItem(`is_demo_${id}`);
        }
    } catch {
        return;
    }
    globalThis.dispatchEvent?.(new Event(PANEL_DEMO_EVENT));
}

/** A panel reply with `"demo": true` turns the demo mode on (never off: only a new login does). */
export function rememberPanelDemo(body: unknown): void {
    if (body && typeof body === 'object' && (body as { demo?: unknown }).demo === true) setSessionDemo(true);
}

/** For a demo: tells the user it is not available and returns true (the caller stops). */
export function blockedForDemo(): boolean {
    if (!isSessionDemo()) return false;
    globalThis.dispatchEvent?.(new Event(PANEL_DEMO_BLOCKED_EVENT));
    return true;
}

/** Stores the panel's end of the demo and its length (0 or missing values are not stored). */
export function setSessionDemoTimes(expires?: number, duration?: number): void {
    try {
        if (expires && expires > 0) localStorage.setItem(SESSION_DEMO_EXPIRES_KEY, String(Math.floor(expires)));
        if (duration && duration > 0) localStorage.setItem(SESSION_DEMO_DURATION_KEY, String(Math.floor(duration)));
    } catch {
        return;
    }
}

function readSeconds(key: string): number {
    try {
        const v = Number(localStorage.getItem(key));
        return Number.isFinite(v) && v > 0 ? v : 0;
    } catch {
        return 0;
    }
}

/** End of the demo (unix seconds) as the panel said; 0 = unknown. */
export function sessionDemoExpires(): number {
    return readSeconds(SESSION_DEMO_EXPIRES_KEY);
}

export interface DemoLength {
    unit: 'DAY' | 'HOUR' | 'MINUTE';
    count: number;
}

/** Length of the demo as the panel says it, in days, hours or minutes (null when unknown). */
export function demoLength(seconds = readSeconds(SESSION_DEMO_DURATION_KEY)): DemoLength | null {
    if (!(seconds > 0)) return null;
    if (seconds % 86400 === 0) return { unit: 'DAY', count: seconds / 86400 };
    if (seconds % 3600 === 0) return { unit: 'HOUR', count: seconds / 3600 };
    return { unit: 'MINUTE', count: Math.round(seconds / 60) };
}

/** Translation key + params of a demo length: MPX.DEMO.HOUR "1 hora", MPX.DEMO.HOURS "{{count}} horas"… */
export function demoLengthKey(length: DemoLength): { key: string; params: { count: number } } {
    return { key: `MPX.DEMO.${length.unit}${length.count === 1 ? '' : 'S'}`, params: { count: length.count } };
}

/**
 * End of the demo with the exact local time ('' when unknown): "13/10/2026 18:45",
 * or in the given locale's own date format.
 */
export function demoEndText(expires = sessionDemoExpires(), locale?: string): string {
    if (!(expires > 0)) return '';
    const d = new Date(expires * 1000);
    if (locale) {
        return d.toLocaleString(locale, { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    }
    const p = (n: number) => String(n).padStart(2, '0');
    return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
}
