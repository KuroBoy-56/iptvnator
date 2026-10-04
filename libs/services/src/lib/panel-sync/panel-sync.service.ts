import { Injectable } from '@angular/core';
import { PanelProgressClient } from './panel-progress.client';
import {
    bucketToFavoriteType,
    findPosition,
    findProgressKey,
    isWatched,
    toFavoritesTree,
    toProgressTree,
} from './panel-sync.mapper';
import {
    FavoriteSyncMeta,
    PanelProgressEntry,
    PlaybackSyncInfo,
    SyncFavoritesTree,
    SyncProgressTree,
    SyncUserCredentials,
} from './panel-sync.types';
import { lookupSeriesInfo } from './series-info.lookup';

const MIN_SAVE_SECONDS = 5;
/** Players report every few seconds; the panel gets at most one save per item in this window. */
export const PANEL_SAVE_INTERVAL_MS = 20_000;

function clean(value: unknown): string {
    const text = value == null ? '' : String(value).trim();
    return text === 'null' || text === 'undefined' ? '' : text;
}

/** Xtream session of the logged-in line, used when callers pass none. */
export function sessionCredentials(): SyncUserCredentials {
    try {
        return {
            username: localStorage.getItem('session_user') || '',
            password: localStorage.getItem('session_pass') || '',
            server: localStorage.getItem('session_server') || '',
        };
    } catch {
        return {};
    }
}

/**
 * Continue watching, playback positions and favorites live on the panel
 * (api/progress.php). The panel is the source of truth; local rows are only a
 * cache rebuilt from it.
 */
@Injectable({ providedIn: 'root' })
export class PanelSyncService {
    private readonly client = new PanelProgressClient();
    private readonly lastSaveAt = new Map<string, number>();

    private creds(userIdObj?: SyncUserCredentials | null): SyncUserCredentials {
        return userIdObj?.username ? userIdObj : sessionCredentials();
    }

    async saveProgress(
        userIdObj: SyncUserCredentials | null | undefined,
        pbInfo: PlaybackSyncInfo | null | undefined,
        currentTime: number,
        duration: number,
        options: { force?: boolean } = {}
    ): Promise<void> {
        if (!pbInfo?.id || !(currentTime > MIN_SAVE_SECONDS)) return;
        const kind = pbInfo.type === 'movie' ? 'movie' : pbInfo.type === 'series' ? 'series' : null;
        if (!kind) return;
        const throttleKey = `${kind}:${clean(pbInfo.id)}`;
        const now = Date.now();
        const watched = isWatched(currentTime, duration);
        if (!options.force && !watched && now - (this.lastSaveAt.get(throttleKey) ?? 0) < PANEL_SAVE_INTERVAL_MS) {
            return;
        }
        this.lastSaveAt.set(throttleKey, now);
        const creds = this.creds(userIdObj);
        const snapshot = await this.client.getSnapshot(creds);
        const progress = snapshot?.progress ?? {};
        const id = clean(pbInfo.id);
        const seriesId = clean(pbInfo.seriesId) || clean(pbInfo.categoryId) || id;
        const existingKey = findProgressKey(progress, kind, kind === 'movie' ? id : seriesId);

        if (watched) {
            if (existingKey) await this.deleteByTitle(creds, existingKey);
            return;
        }

        let title = clean(pbInfo.title);
        let poster = clean(pbInfo.poster) || clean(pbInfo.thumbnail);
        if (kind === 'series') {
            const info = clean(pbInfo.seriesTitle) ? null : await lookupSeriesInfo(creds, seriesId);
            title = clean(pbInfo.seriesTitle) || existingKey || info?.name || title || `Serie ${seriesId}`;
            poster = info?.cover || poster;
        } else {
            title = title || existingKey || `Película ${id}`;
        }

        const entry: PanelProgressEntry = {
            position: Math.floor(currentTime),
            duration: Math.floor(duration || 0),
            url: clean(pbInfo.url),
            poster,
            type: kind === 'movie' ? 'movie' : 'episode',
            id,
            seriesId: kind === 'series' ? seriesId : '',
            categoryId: clean(pbInfo.xtreamCategoryId),
            updatedAt: new Date().toISOString(),
        };
        if (existingKey && existingKey !== title) {
            await this.deleteByTitle(creds, existingKey);
        }
        const ok = await this.client.post(creds, { action: 'save', title, ...entry });
        if (ok) {
            this.client.patchSnapshot(creds, (data) => {
                data.progress[title] = entry;
            });
        }
    }

    async getProgress(
        userIdObj: SyncUserCredentials | null | undefined,
        pbInfo: PlaybackSyncInfo | null | undefined
    ): Promise<number> {
        if (!pbInfo?.id) return 0;
        const kind = pbInfo.type === 'movie' ? 'movie' : pbInfo.type === 'series' ? 'series' : null;
        if (!kind) return 0;
        const snapshot = await this.client.getSnapshot(this.creds(userIdObj));
        return snapshot ? findPosition(snapshot.progress, kind, clean(pbInfo.id)) : 0;
    }

    /** Full panel entry for a movie (VOD id) or an episode (episode id). */
    async getPlaybackEntry(
        userIdObj: SyncUserCredentials | null | undefined,
        kind: 'movie' | 'series',
        id: string | number
    ): Promise<PanelProgressEntry | null> {
        const snapshot = await this.client.getSnapshot(this.creds(userIdObj));
        const wanted = clean(id);
        for (const entry of Object.values(snapshot?.progress ?? {})) {
            if (!entry || String(entry.id) !== wanted) continue;
            const episode = entry.type === 'episode' || entry.type === 'series';
            if (kind === 'movie' ? entry.type === 'movie' : episode) return entry;
        }
        return null;
    }

    async getAllProgress(userIdObj?: SyncUserCredentials | null): Promise<SyncProgressTree> {
        const snapshot = await this.client.getSnapshot(this.creds(userIdObj));
        return toProgressTree(snapshot?.progress);
    }

    async removeProgress(
        userIdObj: SyncUserCredentials | null | undefined,
        type: string,
        id: string
    ): Promise<void> {
        const creds = this.creds(userIdObj);
        const snapshot = await this.client.getSnapshot(creds);
        const kind = type === 'movie' || type === 'vod' ? 'movie' : 'series';
        const key = snapshot ? findProgressKey(snapshot.progress, kind, clean(id)) : null;
        if (key) await this.deleteByTitle(creds, key);
    }

    async addFavorite(
        userIdObj: SyncUserCredentials | null | undefined,
        bucket: string,
        id: string | number,
        _timestamp?: number,
        meta: FavoriteSyncMeta = {}
    ): Promise<void> {
        const creds = this.creds(userIdObj);
        const item = {
            id: clean(id),
            type: bucketToFavoriteType(bucket),
            title: clean(meta.title),
            poster: clean(meta.poster) || clean(meta.thumbnail),
            categoryId: clean(meta.categoryId),
            url: clean(meta.url),
        };
        if (!item.id) return;
        const ok = await this.client.post(creds, { action: 'fav_add', item });
        if (ok) {
            this.client.patchSnapshot(creds, (data) => {
                data.favorites = data.favorites.filter((f) => !(f.id === item.id && f.type === item.type));
                data.favorites.push({ ...item, addedAt: new Date().toISOString() });
            });
        }
    }

    async removeFavorite(
        userIdObj: SyncUserCredentials | null | undefined,
        bucket: string,
        id: string | number
    ): Promise<void> {
        const creds = this.creds(userIdObj);
        const type = bucketToFavoriteType(bucket);
        const favId = clean(id);
        const ok = await this.client.post(creds, { action: 'fav_remove', id: favId, type });
        if (ok) {
            this.client.patchSnapshot(creds, (data) => {
                data.favorites = data.favorites.filter((f) => !(f.id === favId && f.type === type));
            });
        }
    }

    async getAllFavorites(userIdObj?: SyncUserCredentials | null): Promise<SyncFavoritesTree> {
        const snapshot = await this.client.getSnapshot(this.creds(userIdObj));
        return toFavoritesTree(snapshot?.favorites);
    }

    /** Drops the cached snapshot so the next read comes from the panel. */
    async refresh(userIdObj?: SyncUserCredentials | null): Promise<void> {
        await this.client.getSnapshot(this.creds(userIdObj), true);
    }

    private async deleteByTitle(creds: SyncUserCredentials, title: string): Promise<void> {
        const ok = await this.client.post(creds, { action: 'delete', title });
        if (ok) {
            this.client.patchSnapshot(creds, (data) => {
                delete data.progress[title];
            });
        }
    }
}
