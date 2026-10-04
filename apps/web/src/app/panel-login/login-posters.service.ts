import { inject, Injectable } from '@angular/core';
import { TmdbApiService, TmdbRuntimeService, TmdbSearchResult } from '@iptvnator/services';

const CACHE_KEY = 'login_posters_v1';
const CACHE_TTL_MS = 12 * 60 * 60 * 1000;
const POSTER_BASE = 'https://image.tmdb.org/t/p/w342';
const MAX_POSTERS = 48;

/**
 * Poster wall for the login screen: TMDB "now playing" (es-ES), like the web
 * player. Needs a TMDB key (settings or the build-time default); without one
 * the login keeps its plain dark background.
 */
@Injectable({ providedIn: 'root' })
export class LoginPostersService {
    private readonly api = inject(TmdbApiService);
    private readonly runtime = inject(TmdbRuntimeService);

    cached(): string[] {
        try {
            const raw = JSON.parse(localStorage.getItem(CACHE_KEY) ?? 'null');
            return Array.isArray(raw?.posters) ? raw.posters : [];
        } catch {
            return [];
        }
    }

    async load(): Promise<string[]> {
        try {
            const raw = JSON.parse(localStorage.getItem(CACHE_KEY) ?? 'null');
            if (raw && Date.now() - raw.at < CACHE_TTL_MS && raw.posters?.length) {
                return raw.posters;
            }
        } catch {
            // Refresh below.
        }
        const apiKey = this.runtime.apiKey();
        if (!apiKey) return this.cached();
        try {
            const pages = await Promise.all(
                [1, 2, 3].map((page) => this.api.getNowPlaying('es-ES', apiKey, page))
            );
            const posters = ([] as TmdbSearchResult[])
                .concat(...pages)
                .map((movie) => movie.poster_path)
                .filter((path): path is string => !!path)
                .slice(0, MAX_POSTERS)
                .map((path) => `${POSTER_BASE}${path}`);
            if (posters.length) {
                localStorage.setItem(CACHE_KEY, JSON.stringify({ at: Date.now(), posters }));
            }
            return posters.length ? posters : this.cached();
        } catch {
            return this.cached();
        }
    }
}
