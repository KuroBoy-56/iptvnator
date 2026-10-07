const STORAGE_KEY = 'panel_tmdb_key';

/** TMDB key the panel hands out with progress.php (auth and v=2). */
export function readPanelTmdbKey(): string {
    try {
        return localStorage.getItem(STORAGE_KEY)?.trim() ?? '';
    } catch {
        return '';
    }
}

export function rememberPanelTmdbKey(key: unknown): void {
    const value = typeof key === 'string' ? key.trim() : '';
    if (!value || value === 'missing_tmdb_key') return;
    try {
        if (localStorage.getItem(STORAGE_KEY) !== value) localStorage.setItem(STORAGE_KEY, value);
    } catch {
        // Storage unavailable: covers fall back to the provider images.
    }
}
