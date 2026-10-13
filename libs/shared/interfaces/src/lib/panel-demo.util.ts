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
export const DEMO_BLOCKED_MESSAGE = 'No disponible en la DEMO';
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

/** "1 hora", "2 horas", "30 minutos", "1 día"… from the panel's demo length ('' when unknown). */
export function demoLengthText(seconds = readSeconds(SESSION_DEMO_DURATION_KEY)): string {
    if (!(seconds > 0)) return '';
    if (seconds % 86400 === 0) return seconds === 86400 ? '1 día' : `${seconds / 86400} días`;
    if (seconds % 3600 === 0) return seconds === 3600 ? '1 hora' : `${seconds / 3600} horas`;
    const m = Math.round(seconds / 60);
    return m === 1 ? '1 minuto' : `${m} minutos`;
}

/** End of the demo with the exact local time: "13/10/2026 18:45" ('' when unknown). */
export function demoEndText(expires = sessionDemoExpires()): string {
    if (!(expires > 0)) return '';
    const d = new Date(expires * 1000);
    const p = (n: number) => String(n).padStart(2, '0');
    return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
}
