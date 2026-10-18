import { Injectable } from '@angular/core';
import { AppLanguage, currentAppLanguage, panelEndpoint, tmdbLanguageFor, withPanelLang, withTenantQuery } from '@iptvnator/shared/interfaces';

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
 * app's own key). Nothing is kept between starts: without a key in the panel, or when the
 * panel does not answer, the login keeps its plain dark background.
 */
@Injectable({ providedIn: 'root' })
export class LoginPostersService {
    async load(fetcher: typeof fetch = fetch): Promise<string[]> {
        forgetOldPosterCache();
        try {
            const pages = await Promise.all(
                [1, 2, 3].map(async (page) => {
                    const res = await fetcher(loginPostersUrl(page));
                    return res.ok ? res.json() : { error: `http_${res.status}` };
                })
            );
            return postersFromPages(pages);
        } catch {
            return [];
        }
    }
}

/** Versiones anteriores guardaban los pósters 12 h (login_posters_v2…): ya no se usan. */
function forgetOldPosterCache(): void {
    try {
        Object.keys(localStorage)
            .filter((key) => key.startsWith('login_posters_'))
            .forEach((key) => localStorage.removeItem(key));
    } catch {
        // sin almacenamiento: nada que olvidar
    }
}
