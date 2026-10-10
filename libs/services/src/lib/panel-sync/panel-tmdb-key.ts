import { tenantStorageSuffix } from '@iptvnator/shared/interfaces';

const BASE_KEY = 'panel_tmdb_key';
/** One key per distributor (each may have its own TMDB key); the old key with Omitir. */
const storageKey = () => BASE_KEY + tenantStorageSuffix();
/** Fired on window when the panel hands out a (new) TMDB key. */
export const PANEL_TMDB_KEY_EVENT = 'panel-tmdb-key';

/** TMDB key the panel hands out with progress.php (auth and v=2). */
export function readPanelTmdbKey(): string {
    try {
        return localStorage.getItem(storageKey())?.trim() ?? '';
    } catch {
        return '';
    }
}

export function rememberPanelTmdbKey(key: unknown): void {
    const value = typeof key === 'string' ? key.trim() : '';
    if (!value || value === 'missing_tmdb_key') return;
    try {
        if (localStorage.getItem(storageKey()) !== value) {
            localStorage.setItem(storageKey(), value);
            // covers drawn before the first panel answer retry with the key
            globalThis.dispatchEvent?.(new Event(PANEL_TMDB_KEY_EVENT));
        }
    } catch {
        // Storage unavailable: covers fall back to the provider images.
    }
}
