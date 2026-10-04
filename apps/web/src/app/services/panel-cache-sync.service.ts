import { inject, Injectable } from '@angular/core';
import { Store } from '@ngrx/store';
import { firstValueFrom } from 'rxjs';
import { selectAllPlaylistsMeta } from '@iptvnator/m3u-state';
import {
    DatabaseService,
    PanelSyncService,
    PlaybackPositionRuntimeBridgeService,
    SyncFavoritesTree,
    SyncProgressTree,
    SyncUserCredentials,
} from '@iptvnator/services';
import { PlaybackPositionData } from '@iptvnator/shared/interfaces';

const REFRESH_INTERVAL_MS = 60_000;
/** Local rows touched this recently may not have reached the panel yet. */
const LOCAL_GRACE_MS = 120_000;

const FAVORITE_TYPES: Record<keyof SyncFavoritesTree, 'movie' | 'series' | 'live'> = {
    Movie: 'movie',
    Series: 'series',
    LiveTv: 'live',
};

interface PlaylistCreds {
    _id: string;
    username?: string;
    password?: string;
    serverUrl?: string;
}

/**
 * The panel is the source of truth for favorites and playback positions.
 * Electron keeps SQLite rows only as a cache so existing screens (and offline
 * use) keep working; this service rebuilds that cache from the panel:
 * it adds what the panel has and drops what the panel no longer has.
 */
@Injectable({ providedIn: 'root' })
export class PanelCacheSyncService {
    private readonly store = inject(Store);
    private readonly db = inject(DatabaseService);
    private readonly panelSync = inject(PanelSyncService);
    private readonly positions = inject(PlaybackPositionRuntimeBridgeService);
    private timer: ReturnType<typeof setInterval> | null = null;
    private running = false;

    start(): void {
        if (this.timer) return;
        void this.syncAll();
        this.timer = setInterval(() => void this.syncAll(), REFRESH_INTERVAL_MS);
    }

    stop(): void {
        if (this.timer) clearInterval(this.timer);
        this.timer = null;
    }

    async syncAll(): Promise<void> {
        if (this.running) return;
        this.running = true;
        try {
            const playlists = (await firstValueFrom(
                this.store.select(selectAllPlaylistsMeta)
            )) as PlaylistCreds[];
            for (const playlist of playlists) {
                if (!playlist.serverUrl || !playlist.username) continue;
                await this.syncPlaylist(playlist);
            }
        } catch {
            // Panel or DB unavailable: keep the current cache until next run.
        } finally {
            this.running = false;
        }
    }

    private async syncPlaylist(playlist: PlaylistCreds): Promise<void> {
        const creds: SyncUserCredentials = {
            username: playlist.username,
            password: playlist.password,
            server: playlist.serverUrl,
        };
        await this.panelSync.refresh(creds);
        const [progress, favorites] = await Promise.all([
            this.panelSync.getAllProgress(creds),
            this.panelSync.getAllFavorites(creds),
        ]);
        await this.syncPositions(playlist._id, progress);
        await this.syncFavorites(playlist._id, favorites);
    }

    private async syncPositions(playlistId: string, tree: SyncProgressTree): Promise<void> {
        const remote = new Map<string, PlaybackPositionData>();
        for (const [id, leaf] of Object.entries(tree.Movie)) {
            remote.set(`vod:${id}`, {
                contentXtreamId: Number(id),
                contentType: 'vod',
                positionSeconds: leaf.timeline,
                durationSeconds: leaf.duration || undefined,
            });
        }
        for (const [seriesId, episodes] of Object.entries(tree.Series)) {
            for (const [episodeId, leaf] of Object.entries(episodes)) {
                remote.set(`episode:${episodeId}`, {
                    contentXtreamId: Number(episodeId),
                    contentType: 'episode',
                    seriesXtreamId: Number(seriesId),
                    positionSeconds: leaf.timeline,
                    durationSeconds: leaf.duration || undefined,
                });
            }
        }

        const local = await this.positions.getAllPlaybackPositions(playlistId);
        const localByKey = new Map(local.map((p) => [`${p.contentType}:${p.contentXtreamId}`, p]));
        for (const [key, position] of remote) {
            const current = localByKey.get(key);
            if (!current || current.positionSeconds !== position.positionSeconds) {
                await this.positions.savePlaybackPosition(playlistId, position);
            }
        }
        const now = Date.now();
        for (const [key, position] of localByKey) {
            const touched = Date.parse(position.updatedAt ?? '') || 0;
            if (!remote.has(key) && now - touched > LOCAL_GRACE_MS) {
                await this.positions.clearPlaybackPosition(
                    playlistId,
                    position.contentXtreamId,
                    position.contentType
                );
            }
        }
    }

    private async syncFavorites(playlistId: string, tree: SyncFavoritesTree): Promise<void> {
        const remote = new Map<string, { xtreamId: number; type: 'movie' | 'series' | 'live'; poster: string }>();
        for (const bucket of Object.keys(FAVORITE_TYPES) as (keyof SyncFavoritesTree)[]) {
            const type = FAVORITE_TYPES[bucket];
            for (const [id, leaf] of Object.entries(tree[bucket])) {
                remote.set(`${type}:${id}`, { xtreamId: Number(id), type, poster: leaf.thumbnail });
            }
        }

        const local = await this.db.getFavorites(playlistId);
        const localKeys = new Set<string>();
        for (const item of local) {
            const type = item.type === 'movie' || item.type === 'series' ? item.type : 'live';
            const key = `${type}:${item.xtream_id}`;
            localKeys.add(key);
            if (!remote.has(key)) {
                await this.db.removeFromFavorites(item.id, playlistId);
            }
        }
        for (const [key, fav] of remote) {
            if (localKeys.has(key)) continue;
            const content = await this.db.getContentByXtreamId(fav.xtreamId, playlistId, fav.type);
            if (content?.id) {
                await this.db.addToFavorites(content.id, playlistId, fav.poster || undefined);
            }
        }
    }
}
