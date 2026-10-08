/** Xtream line credentials used to prove ownership to the panel once. */
export interface SyncUserCredentials {
    username?: string;
    password?: string;
    server?: string;
}

export type PanelProgressType = 'movie' | 'series' | 'episode' | 'live';
export type PanelFavoriteType = 'movie' | 'series' | 'live';

/** One "continue watching" entry as stored by api/progress.php. */
export interface PanelProgressEntry {
    position: number;
    duration: number;
    url?: string;
    poster?: string;
    type: PanelProgressType;
    id: string;
    seriesId?: string;
    categoryId?: string;
    updatedAt?: string;
    /** Server stamp (epoch seconds with microseconds); the newest-first sort key. */
    ts?: number | string;
}

export interface PanelFavorite {
    id: string;
    type: PanelFavoriteType;
    title?: string;
    poster?: string;
    categoryId?: string;
    url?: string;
    addedAt?: string;
    /** Server stamp (epoch seconds with microseconds); the newest-first sort key. */
    ts?: number | string;
}

/** GET api/progress.php?v=2 response (progress is keyed by title). */
export interface PanelSnapshot {
    progress: Record<string, PanelProgressEntry>;
    favorites: PanelFavorite[];
}

/** Bucket names used by the app's collection readers. */
export type SyncFavoriteBucket = 'Movie' | 'Series' | 'LiveTv';

export interface SyncProgressLeaf {
    timeline: number;
    duration: number;
    thumbnail: string;
    /** Epoch seconds (fractional): panel `ts`, else `updatedAt`. */
    timestamp: number;
    /** Position in the panel response (newest first); tie-breaker for `timestamp`. */
    rank?: number;
    title: string;
    episodeName?: string;
    categoryId?: string;
    url?: string;
}

/**
 * Tree view of the panel progress that the app's readers consume:
 * Movie[vodId] and Series[seriesId][episodeId].
 */
export interface SyncProgressTree {
    Movie: Record<string, SyncProgressLeaf>;
    Series: Record<string, Record<string, SyncProgressLeaf>>;
}

export interface SyncFavoriteLeaf {
    title: string;
    thumbnail: string;
    categoryId: string;
    /** Epoch seconds (fractional): panel `ts`, else `addedAt`. */
    timestamp: number;
    /** Position in the panel response (newest first); tie-breaker for `timestamp`. */
    rank?: number;
}

export type SyncFavoritesTree = Record<
    SyncFavoriteBucket,
    Record<string, SyncFavoriteLeaf>
>;

/** Playback descriptor passed by players when saving or resuming. */
export interface PlaybackSyncInfo {
    type: 'movie' | 'series' | 'live' | string;
    /** VOD stream id or episode id. */
    id: string | number;
    /** Series id for episodes (legacy name kept by the players). */
    categoryId?: string | number;
    seriesId?: string | number;
    seriesTitle?: string;
    title?: string;
    poster?: string;
    thumbnail?: string;
    url?: string;
    xtreamCategoryId?: string | number;
}

export interface FavoriteSyncMeta {
    title?: string;
    thumbnail?: string;
    poster?: string;
    categoryId?: string | number;
    url?: string;
}

/** Channel sent to api/epg.php when the provider has no guide for it. */
export interface PanelEpgChannel {
    id: string;
    epg?: string;
    name?: string;
}

/** Program returned by api/epg.php (epoch seconds). */
export interface PanelEpgProgram {
    s: number;
    e: number;
    t: string;
    d?: string;
}
