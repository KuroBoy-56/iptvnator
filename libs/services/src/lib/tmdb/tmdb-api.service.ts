import { Injectable } from '@angular/core';
import { TMDB_MATCH_LANGUAGE } from '@iptvnator/shared/interfaces';
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
}
