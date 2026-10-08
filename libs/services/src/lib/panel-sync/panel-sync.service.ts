import { Injectable } from '@angular/core';
import { lineKey, PanelProgressClient } from './panel-progress.client';
import {
    bucketToFavoriteType,
    favoriteBucket,
    findPosition,
    findProgressKey,
    isWatched,
    toFavoritesTree,
    toProgressTree,
} from './panel-sync.mapper';
import {
    FavoriteSyncMeta,
    PanelFavorite,
    PanelFavoriteType,
    PanelEpgChannel,
    PanelEpgProgram,
    PanelProgressEntry,
    PlaybackSyncInfo,
    SyncFavoritesTree,
    SyncProgressTree,
    SyncUserCredentials,
} from './panel-sync.types';
import { PanelSportsAgenda } from './panel-sports.types';
import { lookupSeriesInfo } from './series-info.lookup';
import { getSessionPassword } from '@iptvnator/shared/interfaces';
import { applyFavoriteOverrides, FavoriteChange, PanelFavoritesOutbox } from './panel-favorites-outbox';

const MIN_SAVE_SECONDS = 5;
/** api/epg.php accepts at most this many channels per request. */
export const PANEL_EPG_BATCH_SIZE = 400;
/** Players report every few seconds; the panel gets at most one save per item in this window. */
export const PANEL_SAVE_INTERVAL_MS = 20_000;

function clean(value: unknown): string {
    const text = value == null ? '' : String(value).trim();
    return text === 'null' || text === 'undefined' ? '' : text;
}

/** Same favorite whatever spelling of the type the panel row uses ("vod" vs "movie"…). */
function sameFavorite(f: PanelFavorite | null | undefined, type: PanelFavoriteType, id: string): boolean {
    return !!f && String(f.id ?? '').trim() === id && favoriteBucket(f.type) === favoriteBucket(type);
}

/** Xtream session of the logged-in line, used when callers pass none. */
export function sessionCredentials(): SyncUserCredentials {
    try {
        return {
            username: localStorage.getItem('session_user') || '',
            password: getSessionPassword(),
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
    private readonly outbox = new PanelFavoritesOutbox();

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

    /** Saves a favorite on the panel. A failed request is queued and retried by flushFavorites(). */
    async addFavorite(
        userIdObj: SyncUserCredentials | null | undefined,
        bucket: string,
        id: string | number,
        _timestamp?: number,
        meta: FavoriteSyncMeta = {}
    ): Promise<boolean> {
        const creds = this.creds(userIdObj);
        const item = {
            id: clean(id),
            type: bucketToFavoriteType(bucket),
            title: clean(meta.title),
            poster: clean(meta.poster) || clean(meta.thumbnail),
            categoryId: clean(meta.categoryId),
            url: clean(meta.url),
        };
        const user = lineKey(creds);
        if (!item.id || !user) return false;
        const change = this.outbox.record({ op: 'add', user, type: item.type, id: item.id, item });
        return this.send(creds, change);
    }

    async removeFavorite(
        userIdObj: SyncUserCredentials | null | undefined,
        bucket: string,
        id: string | number
    ): Promise<boolean> {
        const creds = this.creds(userIdObj);
        const user = lineKey(creds);
        const favId = clean(id);
        if (!favId || !user) return false;
        const change = this.outbox.record({ op: 'remove', user, type: bucketToFavoriteType(bucket), id: favId });
        return this.send(creds, change);
    }

    /** Retries favorite changes that did not reach the panel (offline, panel down…). */
    async flushFavorites(userIdObj?: SyncUserCredentials | null): Promise<void> {
        const creds = this.creds(userIdObj);
        for (const change of this.outbox.pending(lineKey(creds))) {
            if (!(await this.send(creds, change))) return; // still unreachable: keep the rest for later
        }
    }

    /** Panel favorites with this device's fresh, not yet visible changes applied. */
    async getAllFavorites(userIdObj?: SyncUserCredentials | null): Promise<SyncFavoritesTree> {
        const creds = this.creds(userIdObj);
        const snapshot = await this.client.getSnapshot(creds);
        return toFavoritesTree(applyFavoriteOverrides(snapshot?.favorites ?? [], this.outbox.overrides(lineKey(creds))));
    }

    /** Is this item in "Mi lista"? null when the panel cannot be read and nothing is known locally. */
    async isFavorite(
        userIdObj: SyncUserCredentials | null | undefined,
        bucket: string,
        id: string | number
    ): Promise<boolean | null> {
        const creds = this.creds(userIdObj);
        const type = bucketToFavoriteType(bucket);
        const favId = clean(id);
        const local = this.outbox.overrides(lineKey(creds)).find((c) => c.type === type && c.id === favId);
        if (local) return local.op === 'add';
        const snapshot = await this.client.getSnapshot(creds);
        return snapshot ? snapshot.favorites.some((f) => sameFavorite(f, type, favId)) : null;
    }

    private async send(creds: SyncUserCredentials, change: FavoriteChange): Promise<boolean> {
        const body =
            change.op === 'add'
                ? { action: 'fav_add', item: change.item ?? { id: change.id, type: change.type } }
                : { action: 'fav_remove', id: change.id, type: change.type };
        const ok = await this.client.post(creds, body);
        if (!ok) return false;
        this.outbox.markSent(change);
        this.client.patchSnapshot(creds, (data) => {
            data.favorites = data.favorites.filter((f) => !sameFavorite(f, change.type, change.id));
            if (change.op === 'add') {
                data.favorites.unshift({ ...(change.item ?? { id: change.id, type: change.type }), addedAt: new Date().toISOString() });
            }
        });
        return true;
    }

    /**
     * Fallback guide from api/epg.php for channels the provider has no EPG
     * for. Requests are split into batches of PANEL_EPG_BATCH_SIZE.
     */
    async fetchFallbackEpg(
        channels: PanelEpgChannel[],
        userIdObj?: SyncUserCredentials | null
    ): Promise<Record<string, PanelEpgProgram[]>> {
        const creds = this.creds(userIdObj);
        const out: Record<string, PanelEpgProgram[]> = {};
        for (let i = 0; i < channels.length; i += PANEL_EPG_BATCH_SIZE) {
            const batch = channels.slice(i, i + PANEL_EPG_BATCH_SIZE);
            const body = await this.client.postJson<{ epg?: Record<string, PanelEpgProgram[]> }>(
                'epg.php',
                creds,
                { channels: batch }
            );
            for (const [id, programs] of Object.entries(body?.epg ?? {})) {
                if (Array.isArray(programs)) out[id] = programs;
            }
        }
        return out;
    }

    /** Sports agenda for today and tomorrow plus the channel-matching rules. */
    async fetchSportsAgenda(userIdObj?: SyncUserCredentials | null): Promise<PanelSportsAgenda | null> {
        const body = await this.client.postJson<Partial<PanelSportsAgenda>>('sports.php', this.creds(userIdObj), {});
        if (!body || !Array.isArray(body.events)) return null;
        return {
            events: body.events.filter((e) => e && e.id && e.ts),
            sports: body.sports && typeof body.sports === 'object' ? body.sports : {},
            match: body.match as PanelSportsAgenda['match'],
        };
    }

    /** Reloads the snapshot from the panel; false when the panel could not be read. */
    async refresh(userIdObj?: SyncUserCredentials | null): Promise<boolean> {
        return !!(await this.client.getSnapshot(this.creds(userIdObj), true));
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
