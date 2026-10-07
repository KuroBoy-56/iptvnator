import { Injectable, inject } from '@angular/core';
import { TmdbMediaType } from '@iptvnator/shared/interfaces';
import { TmdbApiService } from './tmdb-api.service';
import { tmdbBackdropUrl, tmdbPosterUrl } from './tmdb-config';
import {
    buildSearchTitleVariants,
    extractYear,
    pickConfidentMatch,
} from './tmdb-matcher';
import { TmdbRuntimeService } from './tmdb-runtime.service';
import { TmdbSearchResult } from './tmdb.types';

const CACHE_KEY = 'tmdb_poster_cache_v1';
const MAX_CACHE_ENTRIES = 3000;
const MAX_PARALLEL = 4;

type PosterCache = Record<string, string>;

/**
 * Cover fallback for cards whose provider artwork is missing or broken:
 * searches TMDB by title and remembers the answer ('' = nothing found) so
 * each title is looked up once per device.
 */
@Injectable({ providedIn: 'root' })
export class TmdbPosterService {
    private readonly api = inject(TmdbApiService);
    private readonly runtime = inject(TmdbRuntimeService);
    private readonly pending = new Map<string, Promise<string | null>>();
    private readonly queue: (() => void)[] = [];
    private running = 0;
    private cache: PosterCache | null = null;

    /** TMDB poster URL for a provider title, or null. */
    find(title: string | null | undefined, type: TmdbMediaType): Promise<string | null> {
        return this.lookup(title, type, 'poster');
    }

    /** TMDB backdrop (wide image) URL for a provider title, or null. Used by the billboard. */
    findBackdrop(title: string | null | undefined, type: TmdbMediaType): Promise<string | null> {
        return this.lookup(title, type, 'backdrop');
    }

    private lookup(title: string | null | undefined, type: TmdbMediaType, kind: 'poster' | 'backdrop'): Promise<string | null> {
        const raw = (title ?? '').trim();
        const apiKey = this.runtime.apiKey();
        if (!raw || !apiKey) return Promise.resolve(null);
        const key = `${kind === 'backdrop' ? 'bd|' : ''}${type}|${raw.toLowerCase()}`;
        const known = this.readCache()[key];
        if (known !== undefined) return Promise.resolve(known || null);
        const inflight = this.pending.get(key);
        if (inflight) return inflight;
        const job = this.limit(() => this.search(raw, type, apiKey, kind))
            .then((url) => {
                this.remember(key, url ?? '');
                return url;
            })
            // Network/API errors are not remembered so the next view retries.
            .catch(() => null)
            .finally(() => this.pending.delete(key));
        this.pending.set(key, job);
        return job;
    }

    private async search(raw: string, type: TmdbMediaType, apiKey: string, kind: 'poster' | 'backdrop'): Promise<string | null> {
        const field = kind === 'backdrop' ? 'backdrop_path' : 'poster_path';
        const toUrl = kind === 'backdrop' ? tmdbBackdropUrl : tmdbPosterUrl;
        const year = extractYear(null, raw);
        const language = this.runtime.language();
        let fallback: TmdbSearchResult | null = null;
        for (const title of buildSearchTitleVariants(raw)) {
            const results =
                type === 'movie'
                    ? await this.api.searchMovie(title, null, language, apiKey)
                    : await this.api.searchTv(title, null, language, apiKey);
            const withImage = results.filter((r) => !!r[field]);
            const match = pickConfidentMatch(withImage, { title, year }, type);
            if (match) return toUrl(match[field]);
            fallback ??= withImage[0] ?? null;
        }
        // No confident match: any cover beats an empty card.
        return toUrl(fallback?.[field]);
    }

    private limit<T>(task: () => Promise<T>): Promise<T> {
        return new Promise<T>((resolve, reject) => {
            const run = () => {
                this.running++;
                task()
                    .then(resolve, reject)
                    .finally(() => {
                        this.running--;
                        this.queue.shift()?.();
                    });
            };
            if (this.running < MAX_PARALLEL) run();
            else this.queue.push(run);
        });
    }

    private readCache(): PosterCache {
        if (this.cache) return this.cache;
        try {
            const parsed = JSON.parse(localStorage.getItem(CACHE_KEY) ?? '{}');
            this.cache = parsed && typeof parsed === 'object' ? parsed : {};
        } catch {
            this.cache = {};
        }
        return this.cache as PosterCache;
    }

    private remember(key: string, url: string): void {
        const cache = this.readCache();
        cache[key] = url;
        const keys = Object.keys(cache);
        if (keys.length > MAX_CACHE_ENTRIES) {
            for (const old of keys.slice(0, keys.length - MAX_CACHE_ENTRIES)) delete cache[old];
        }
        try {
            localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
        } catch {
            // Storage full or unavailable: the in-memory cache still helps.
        }
    }
}
