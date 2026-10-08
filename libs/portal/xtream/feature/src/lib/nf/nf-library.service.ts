import { Injectable, inject } from '@angular/core';
import {
    PanelSyncService,
    panelNewestFirst,
    SyncUserCredentials,
} from '@iptvnator/services';
import { NfItem } from './nf-item';

export interface NfLibrary {
    continueWatching: NfItem[];
    myList: NfItem[];
}

type Catalog = { movie: Map<number, NfItem>; series: Map<number, NfItem> };
type Ranked = { item: NfItem; timestamp: number; rank?: number };

function pct(position: number, duration: number): number {
    return duration > 0
        ? Math.max(2, Math.min(100, Math.round((position / duration) * 100)))
        : 5;
}

/**
 * "Continuar viendo" and "Mi lista" from the panel (the same lists the web
 * player and Android show), matched with the loaded catalog for covers and
 * categories. Titles the provider no longer has are left out.
 */
@Injectable({ providedIn: 'root' })
export class NfLibraryService {
    private readonly panel = inject(PanelSyncService);

    async load(
        creds: SyncUserCredentials,
        movies: NfItem[],
        series: NfItem[]
    ): Promise<NfLibrary> {
        const catalog: Catalog = {
            movie: new Map(movies.map((m) => [m.id, m])),
            series: new Map(series.map((s) => [s.id, s])),
        };
        const [progress, favorites] = await Promise.all([
            this.panel.getAllProgress(creds),
            this.panel.getAllFavorites(creds),
        ]);

        const watching: Ranked[] = [];
        for (const [id, leaf] of Object.entries(progress.Movie)) {
            const item = this.match(
                catalog,
                'movie',
                id,
                leaf.title,
                leaf.thumbnail
            );
            if (item)
                watching.push({
                    item: {
                        ...item,
                        progress: pct(leaf.timeline, leaf.duration),
                    },
                    timestamp: leaf.timestamp,
                    rank: leaf.rank,
                });
        }
        for (const [seriesId, episodes] of Object.entries(progress.Series)) {
            // the series shows its most recently watched episode
            const last = Object.values(episodes).sort(panelNewestFirst)[0];
            if (!last) continue;
            const item = this.match(
                catalog,
                'series',
                seriesId,
                last.title,
                last.thumbnail
            );
            if (item)
                watching.push({
                    item: {
                        ...item,
                        progress: pct(last.timeline, last.duration),
                    },
                    timestamp: last.timestamp,
                    rank: last.rank,
                });
        }

        const listed: Ranked[] = [];
        for (const [bucket, type] of [
            ['Movie', 'movie'],
            ['Series', 'series'],
        ] as const) {
            for (const [id, leaf] of Object.entries(favorites[bucket])) {
                const item = this.match(
                    catalog,
                    type,
                    id,
                    leaf.title,
                    leaf.thumbnail
                );
                if (item)
                    listed.push({
                        item,
                        timestamp: leaf.timestamp,
                        rank: leaf.rank,
                    });
            }
        }

        // newest first, like the web player: panel `ts`, then panel order
        return {
            continueWatching: watching
                .sort(panelNewestFirst)
                .map((w) => w.item),
            myList: listed.sort(panelNewestFirst).map((l) => l.item),
        };
    }

    private match(
        catalog: Catalog,
        type: 'movie' | 'series',
        id: string,
        title: string,
        poster: string
    ): NfItem | null {
        const known = catalog[type].get(Number(id));
        // the catalog may still be loading: without it, show what the panel saved
        if (!known && catalog[type].size > 0) return null;
        const base: NfItem = known ?? {
            id: Number(id),
            type,
            title,
            poster,
            rating: '',
            categoryId: '0',
            added: 0,
        };
        return {
            ...base,
            poster: base.poster || poster,
            title: base.title || title,
        };
    }
}
