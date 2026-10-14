import { Injectable } from '@angular/core';
import { AppLanguage, currentAppLanguage, panelEndpoint, tenantStorageSuffix, tmdbLanguageFor, withPanelLang, withTenantQuery } from '@iptvnator/shared/interfaces';

const CACHE_KEY = 'login_posters_v2';
const CACHE_TTL_MS = 12 * 60 * 60 * 1000;
const POSTER_BASE = 'https://image.tmdb.org/t/p/w342';
const MAX_POSTERS = 48;

/** TMDB "now playing" page through the panel (api/tmdb.php, the panel's key). */
export function loginPostersUrl(page: number, lang: AppLanguage = currentAppLanguage()): string {
    // ?path= (not tmdb.php/movie/now_playing): many hostings don't pass PATH_INFO
    const url = `${panelEndpoint('tmdb.php')}?path=movie/now_playing&language=${tmdbLanguageFor(lang)}&page=${page}`;
    return withTenantQuery(withPanelLang(url, lang));
}

/** Poster URLs of the panel answers; [] when the panel has no TMDB key (tmdb_key_not_set). */
export function postersFromPages(pages: unknown[]): string[] {
    const out: string[] = [];
    for (const p of pages) {
        if (!p || typeof p !== 'object' || 'error' in p) return [];
        const results = (p as { results?: { poster_path?: string | null }[] }).results ?? [];
        for (const r of results) if (r?.poster_path) out.push(`${POSTER_BASE}${r.poster_path}`);
    }
    return [...new Set(out)].slice(0, MAX_POSTERS);
}

/**
 * Poster wall for the login screen, like the web player: only with the TMDB key of the
 * distributor or, with Omitir, of the owner (asked to the panel's api/tmdb.php, never the
 * app's own key). Without a key in the panel the login keeps its plain dark background.
 */
@Injectable({ providedIn: 'root' })
export class LoginPostersService {
    private key(): string {
        return CACHE_KEY + tenantStorageSuffix();
    }

    cached(): string[] {
        try {
            const raw = JSON.parse(localStorage.getItem(this.key()) ?? 'null');
            return Array.isArray(raw?.posters) ? raw.posters : [];
        } catch {
            return [];
        }
    }

    async load(fetcher: typeof fetch = fetch): Promise<string[]> {
        try {
            const raw = JSON.parse(localStorage.getItem(this.key()) ?? 'null');
            if (raw && Date.now() - raw.at < CACHE_TTL_MS && raw.posters?.length) {
                return raw.posters;
            }
        } catch {
            // Refresh below.
        }
        try {
            const pages = await Promise.all(
                [1, 2, 3].map(async (page) => {
                    const res = await fetcher(loginPostersUrl(page));
                    return res.ok ? res.json() : { error: `http_${res.status}` };
                })
            );
            const posters = postersFromPages(pages);
            if (posters.length) localStorage.setItem(this.key(), JSON.stringify({ at: Date.now(), posters }));
            else localStorage.removeItem(this.key());
            return posters;
        } catch {
            // the panel did not answer (offline): what was shown last time
            return this.cached();
        }
    }
}
