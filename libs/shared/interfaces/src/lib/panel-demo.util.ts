/**
 * Demo line in use (the "Autodemo" button, or the panel says `"demo": true` in check_mac /
 * auto_demo / progress.php). While it is on, the app shows "DEMO" instead of the line's user and
 * password and keeps no progress ("Continuar viendo") nor favorites ("Mi lista").
 */
export const SESSION_DEMO_KEY = 'session_demo';
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
        else localStorage.removeItem(SESSION_DEMO_KEY);
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
