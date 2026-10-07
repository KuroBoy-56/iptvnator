import { Injectable, inject } from '@angular/core';
import {
    XtreamApiService,
    XtreamCredentials,
} from '@iptvnator/portal/xtream/data-access';
import { TmdbPosterService } from '@iptvnator/services';
import { dailyShuffle, newestFirst, NfItem } from './nf-item';

export interface NfHeroSlide {
    item: NfItem;
    title: string;
    description: string;
    year: string;
    genre: string;
    rating: string;
    backdrop: string;
}

const POOL_PER_TYPE = 8;
const MAX_SLIDES = 6;

type Info = Record<string, unknown>;

function str(value: unknown): string {
    return value == null ? '' : String(value).trim();
}

function firstBackdrop(info: Info): string {
    const bd = info['backdrop_path'];
    const value = Array.isArray(bd) ? bd[0] : bd;
    return str(value);
}

/**
 * Billboard slides like the web player: recent titles with a poster, their
 * provider info (backdrop, plot, year, genre). Titles without a backdrop use
 * the TMDB one, or are skipped. Results are kept for the session.
 */
@Injectable({ providedIn: 'root' })
export class NfHeroService {
    private readonly api = inject(XtreamApiService);
    private readonly tmdb = inject(TmdbPosterService);
    private readonly cache = new Map<string, Promise<NfHeroSlide[]>>();

    slides(
        key: string,
        credentials: XtreamCredentials,
        pools: NfItem[][]
    ): Promise<NfHeroSlide[]> {
        const cached = this.cache.get(key);
        if (cached) return cached;
        const pending = this.build(credentials, pools).catch(() => []);
        this.cache.set(key, pending);
        void pending.then((slides) => {
            if (!slides.length) this.cache.delete(key); // try again next time
        });
        return pending;
    }

    private async build(
        credentials: XtreamCredentials,
        pools: NfItem[][]
    ): Promise<NfHeroSlide[]> {
        const picks: NfItem[] = [];
        for (const pool of pools) {
            const recent = newestFirst(pool.filter((i) => i.poster)).slice(
                0,
                150
            );
            picks.push(...dailyShuffle(recent, 'hero').slice(0, POOL_PER_TYPE));
        }
        const slides = await Promise.all(
            dailyShuffle(picks, 'mix').map((item) =>
                this.slide(credentials, item)
            )
        );
        return slides.filter((s): s is NfHeroSlide => !!s).slice(0, MAX_SLIDES);
    }

    private async slide(
        credentials: XtreamCredentials,
        item: NfItem
    ): Promise<NfHeroSlide | null> {
        let info: Info = {};
        try {
            const res = (item.type === 'series'
                ? await this.api.getSeriesInfo(credentials, item.id, {
                      suppressErrorLog: true,
                  })
                : await this.api.getVodInfo(credentials, item.id, {
                      suppressErrorLog: true,
                  })) as unknown as { info?: Info };
            info =
                res?.info &&
                typeof res.info === 'object' &&
                !Array.isArray(res.info)
                    ? res.info
                    : {};
        } catch {
            info = {};
        }
        let backdrop = firstBackdrop(info);
        if (!backdrop) {
            backdrop =
                (await this.tmdb.findBackdrop(
                    item.title,
                    item.type === 'series' ? 'tv' : 'movie'
                )) ?? '';
        }
        if (!backdrop) return null;
        const date = str(
            info['releasedate'] ?? info['releaseDate'] ?? info['release_date']
        );
        return {
            item,
            title: str(info['name']) || item.title,
            description: str(info['plot'] ?? info['description']),
            year: date.slice(0, 4),
            genre: str(info['genre'])
                .split(',')
                .map((g) => g.trim())
                .filter(Boolean)
                .slice(0, 2)
                .join(', '),
            rating: item.rating || str(info['rating']),
            backdrop,
        };
    }
}
