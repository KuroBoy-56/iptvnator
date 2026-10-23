import { Injectable } from '@angular/core';
import { panelEndpoint, TMDB_MATCH_LANGUAGE, withTenantQuery } from '@iptvnator/shared/interfaces';
import { readPanelTmdbKey } from '../panel-sync/panel-tmdb-key';
import { TMDB_API_BASE_URL } from './tmdb-config';
import {
    TmdbMovieDetails,
    TmdbPersonDetails,
    TmdbSearchResponse,
    TmdbSearchResult,
    TmdbSeasonDetails,
    TmdbTvDetails,
} from './tmdb.types';

/**
 * Thin TMDB v3 API client. Uses `fetch` directly — TMDB supports CORS, so
 * both the Electron renderer and the PWA can call it without a proxy.
 * Supports classic v3 keys (query param) and v4 read tokens (Bearer).
 */
@Injectable({ providedIn: 'root' })
export class TmdbApiService {
    async searchMovie(
        query: string,
        year: number | null,
        language: string,
        apiKey: string
    ): Promise<TmdbSearchResult[]> {
        const response = await this.request<TmdbSearchResponse>(
            '/search/movie',
            {
                query,
                language,
                ...(year !== null ? { year: String(year) } : {}),
            },
            apiKey
        );
        return response.results ?? [];
    }

    async searchTv(
        query: string,
        year: number | null,
        language: string,
        apiKey: string
    ): Promise<TmdbSearchResult[]> {
        const response = await this.request<TmdbSearchResponse>(
            '/search/tv',
            {
                query,
                language,
                ...(year !== null ? { first_air_date_year: String(year) } : {}),
            },
            apiKey
        );
        return response.results ?? [];
    }

    async getMovieDetails(
        tmdbId: number,
        language: string,
        apiKey: string
    ): Promise<TmdbMovieDetails> {
        const details = await this.request<TmdbMovieDetails>(
            `/movie/${tmdbId}`,
            { language, append_to_response: 'credits,videos,recommendations' },
            apiKey
        );
        return this.withMatchRecommendations(`/movie/${tmdbId}`, details, language, apiKey);
    }

    async getTvDetails(
        tmdbId: number,
        language: string,
        apiKey: string
    ): Promise<TmdbTvDetails> {
        const details = await this.request<TmdbTvDetails>(
            `/tv/${tmdbId}`,
            { language, append_to_response: 'credits,videos,recommendations' },
            apiKey
        );
        return this.withMatchRecommendations(`/tv/${tmdbId}`, details, language, apiKey);
    }

    /** Movies now in theaters (login poster wall) */
    async getNowPlaying(
        language: string,
        apiKey: string,
        page = 1
    ): Promise<TmdbSearchResult[]> {
        const response = await this.request<TmdbSearchResponse>(
            '/movie/now_playing',
            { language, page: String(page) },
            apiKey
        );
        return response.results ?? [];
    }

    /** Weekly trending titles for one media type */
    async getTrending(
        mediaType: 'movie' | 'tv',
        language: string,
        apiKey: string
    ): Promise<TmdbSearchResult[]> {
        const response = await this.request<TmdbSearchResponse>(
            `/trending/${mediaType}/week`,
            { language },
            apiKey
        );
        return response.results ?? [];
    }

    async getPersonDetails(
        personId: number,
        language: string,
        apiKey: string
    ): Promise<TmdbPersonDetails> {
        const person = await this.request<TmdbPersonDetails>(
            `/person/${personId}`,
            { language, append_to_response: 'combined_credits' },
            apiKey
        );
        // the filmography is matched against the Spanish catalog by title
        if (language !== TMDB_MATCH_LANGUAGE) {
            person.combined_credits = await this.request<TmdbPersonDetails['combined_credits']>(
                `/person/${personId}/combined_credits`,
                { language: TMDB_MATCH_LANGUAGE },
                apiKey
            ).catch(() => person.combined_credits);
        }
        return person;
    }

    async getSeasonDetails(
        tmdbId: number,
        seasonNumber: number,
        language: string,
        apiKey: string
    ): Promise<TmdbSeasonDetails> {
        return this.request<TmdbSeasonDetails>(
            `/tv/${tmdbId}/season/${seasonNumber}`,
            { language },
            apiKey
        );
    }

    /**
     * Cheap authenticated call to verify an API key. Used by the settings
     * "check key" button.
     */
    async validateApiKey(apiKey: string): Promise<boolean> {
        try {
            await this.request('/configuration', {}, apiKey);
            return true;
        } catch {
            return false;
        }
    }

    /** "Similar" titles are matched against the Spanish catalog by title: always es-MX */
    private async withMatchRecommendations<T extends TmdbMovieDetails | TmdbTvDetails>(
        path: string,
        details: T,
        language: string,
        apiKey: string
    ): Promise<T> {
        if (language === TMDB_MATCH_LANGUAGE) return details;
        const d: TmdbMovieDetails | TmdbTvDetails = details;
        d.recommendations = await this.request<TmdbSearchResponse>(
            `${path}/recommendations`,
            { language: TMDB_MATCH_LANGUAGE },
            apiKey
        ).catch(() => d.recommendations);
        return details;
    }

    private async request<T>(
        path: string,
        params: Record<string, string>,
        apiKey: string
    ): Promise<T> {
        // With the panel's key the lookup goes through the panel (api/tmdb.php: its key and 24 h cache);
        // a key the user typed in Settings still goes straight to TMDB, and so does the panel being down.
        if (apiKey && apiKey === readPanelTmdbKey() && path !== '/configuration') {
            const viaPanel = await this.viaPanel<T>(path, params);
            if (viaPanel !== null) return viaPanel;
        }
        const url = new URL(`${TMDB_API_BASE_URL}${path}`);
        for (const [key, value] of Object.entries(params)) {
            url.searchParams.set(key, value);
        }

        // v4 read access tokens are JWTs sent as a Bearer header; v3 keys
        // travel as the api_key query param
        const isBearerToken = apiKey.startsWith('eyJ');
        if (!isBearerToken) {
            url.searchParams.set('api_key', apiKey);
        }

        const response = await fetch(url.toString(), {
            headers: {
                accept: 'application/json',
                ...(isBearerToken
                    ? { authorization: `Bearer ${apiKey}` }
                    : {}),
            },
        });

        if (!response.ok) {
            throw new Error(
                `TMDB request failed: ${response.status} ${response.statusText}`
            );
        }

        return (await response.json()) as T;
    }

    /** The same request through the panel; null when the panel could not answer it. */
    private async viaPanel<T>(path: string, params: Record<string, string>): Promise<T | null> {
        try {
            const query = new URLSearchParams({ path: path.replace(/^\//, ''), ...params });
            const response = await fetch(withTenantQuery(`${panelEndpoint('tmdb.php')}?${query}`), {
                headers: { accept: 'application/json' },
            });
            if (!response.ok) return null;
            const body = (await response.json()) as { error?: unknown; success?: boolean };
            // {"error": "tmdb_key_not_set"} from the panel or {"success": false} from TMDB
            return body && !body.error && body.success !== false ? (body as T) : null;
        } catch {
            return null;
        }
    }
}
