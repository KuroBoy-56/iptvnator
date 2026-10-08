import {
    PanelFavorite,
    PanelFavoriteType,
    PanelProgressEntry,
    SyncFavoriteBucket,
    SyncFavoritesTree,
    SyncProgressTree,
} from './panel-sync.types';

/** Share of the runtime after which an item counts as watched. */
export const WATCHED_RATIO = 0.95;

/**
 * ISO / "Y-m-d H:i:s" strings, or epoch seconds / milliseconds / microseconds
 * (the panel's `ts` is a microsecond-precision float) → epoch seconds, keeping
 * the fraction so items saved within the same second still sort correctly.
 */
function toEpochSeconds(value?: string | number | null): number {
    if (value == null || value === '') return 0;
    if (typeof value === 'number' || /^\d+(\.\d+)?$/.test(String(value).trim())) {
        const n = Number(value);
        if (!Number.isFinite(n) || n <= 0) return 0;
        if (n > 1e14) return n / 1e6; // microseconds
        if (n > 1e11) return n / 1e3; // milliseconds
        return n;
    }
    const ms = Date.parse(String(value).trim().replace(' ', 'T'));
    return Number.isFinite(ms) ? ms / 1000 : 0;
}

/** Newest-first key of a panel row: `ts`, then the ISO/date field. */
function rowTimestamp(ts: unknown, fallback?: string): number {
    return toEpochSeconds(ts as string | number | null | undefined) || toEpochSeconds(fallback);
}

function isEpisode(entry: PanelProgressEntry): boolean {
    return entry.type === 'episode' || (entry.type === 'series' && !!entry.seriesId);
}

/** Panel progress (keyed by title) -> Movie[id] / Series[seriesId][episodeId]. */
export function toProgressTree(
    progress: Record<string, PanelProgressEntry> | null | undefined
): SyncProgressTree {
    const tree: SyncProgressTree = { Movie: {}, Series: {} };
    let rank = 0;
    for (const [title, entry] of Object.entries(progress ?? {})) {
        if (!entry || !entry.id || !(Number(entry.position) > 0)) continue;
        const leaf = {
            timeline: Math.floor(Number(entry.position)),
            duration: Math.floor(Number(entry.duration) || 0),
            thumbnail: entry.poster || '',
            timestamp: rowTimestamp(entry.ts, entry.updatedAt),
            rank: rank++,
            title,
            categoryId: entry.categoryId || undefined,
            url: entry.url || undefined,
        };
        if (isEpisode(entry)) {
            const seriesId = String(entry.seriesId || entry.id);
            tree.Series[seriesId] = tree.Series[seriesId] ?? {};
            tree.Series[seriesId][String(entry.id)] = {
                ...leaf,
                episodeName: title,
            };
        } else if (entry.type === 'movie') {
            tree.Movie[String(entry.id)] = leaf;
        }
    }
    return tree;
}

// The web player, Android and older panel rows do not all spell the type the same way.
const BUCKET_BY_TYPE: Record<string, SyncFavoriteBucket> = {
    movie: 'Movie',
    movies: 'Movie',
    vod: 'Movie',
    pelicula: 'Movie',
    series: 'Series',
    serie: 'Series',
    tv: 'Series',
    live: 'LiveTv',
    livetv: 'LiveTv',
    channel: 'LiveTv',
    canal: 'LiveTv',
};

/** Panel favorite type (any spelling) → app bucket, or null when unknown. */
export function favoriteBucket(type: unknown): SyncFavoriteBucket | null {
    return BUCKET_BY_TYPE[String(type ?? '').trim().toLowerCase()] ?? null;
}

/** App bucket name ('Movie' | 'Series' | 'LiveTv') -> panel favorite type. */
export function bucketToFavoriteType(bucket: string): PanelFavoriteType {
    const value = String(bucket).toLowerCase();
    if (value === 'movie' || value === 'vod') return 'movie';
    if (value === 'series') return 'series';
    return 'live';
}

export function toFavoritesTree(
    favorites: PanelFavorite[] | null | undefined
): SyncFavoritesTree {
    const tree: SyncFavoritesTree = { Movie: {}, Series: {}, LiveTv: {} };
    let rank = 0;
    for (const fav of favorites ?? []) {
        const bucket = fav ? favoriteBucket(fav.type) : null;
        const id = fav ? String(fav.id ?? '').trim() : '';
        if (!bucket || !id) continue;
        tree[bucket][id] = {
            title: fav.title || '',
            thumbnail: fav.poster || '',
            categoryId: fav.categoryId ? String(fav.categoryId) : '0',
            timestamp: rowTimestamp(fav.ts, fav.addedAt),
            rank: rank++,
        };
    }
    return tree;
}

/** Finds the panel key (title) of a movie or of a series' entry. */
export function findProgressKey(
    progress: Record<string, PanelProgressEntry>,
    kind: 'movie' | 'series',
    id: string
): string | null {
    for (const [title, entry] of Object.entries(progress)) {
        if (!entry) continue;
        if (kind === 'movie' && entry.type === 'movie' && String(entry.id) === id) {
            return title;
        }
        if (
            kind === 'series' &&
            isEpisode(entry) &&
            (String(entry.seriesId) === id || String(entry.id) === id)
        ) {
            return title;
        }
    }
    return null;
}

/** Position of a movie (by VOD id) or an episode (by episode id). */
export function findPosition(
    progress: Record<string, PanelProgressEntry>,
    kind: 'movie' | 'series',
    id: string
): number {
    for (const entry of Object.values(progress)) {
        if (!entry || String(entry.id) !== id) continue;
        if (kind === 'movie' ? entry.type === 'movie' : isEpisode(entry)) {
            return Math.floor(Number(entry.position) || 0);
        }
    }
    return 0;
}

/** Newest first: by timestamp, then by the order the panel returned the rows in. */
export function panelNewestFirst(
    a: { timestamp: number; rank?: number },
    b: { timestamp: number; rank?: number }
): number {
    return b.timestamp - a.timestamp || (a.rank ?? 0) - (b.rank ?? 0);
}

export function isWatched(position: number, duration: number): boolean {
    return duration > 0 && position / duration >= WATCHED_RATIO;
}
