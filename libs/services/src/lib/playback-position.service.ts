import { inject, Injectable } from '@angular/core';
import { PlaybackPositionData } from '@iptvnator/shared/interfaces';
import { PlaybackPositionRuntimeBridgeService } from './playback-position-runtime-bridge.service';
import { PanelSyncService, PlaybackSyncInfo } from './panel-sync';

type PositionWithMeta = PlaybackPositionData & {
    title?: string;
    name?: string;
    poster?: string;
    posterUrl?: string;
    thumbnail?: string;
    url?: string;
    seriesTitle?: string;
};

/**
 * Playback positions. The panel (api/progress.php) is the source of truth:
 * writes go to the panel, reads prefer the panel and the local store is only
 * a cache that keeps the UI responsive and works offline.
 */
@Injectable({
    providedIn: 'root',
})
export class PlaybackPositionService {
    private readonly playbackPositionBridge = inject(
        PlaybackPositionRuntimeBridgeService
    );
    private readonly panelSync = inject(PanelSyncService);

    async savePlaybackPosition(
        playlistId: string,
        data: PlaybackPositionData
    ): Promise<void> {
        try {
            await this.playbackPositionBridge.savePlaybackPosition(
                playlistId,
                data
            );
        } catch (error) {
            console.error('Error saving playback position:', error);
        }

        try {
            const meta = data as PositionWithMeta;
            const pbInfo: PlaybackSyncInfo = {
                type: data.contentType === 'vod' ? 'movie' : 'series',
                id: String(data.contentXtreamId),
                categoryId: String(data.seriesXtreamId || data.contentXtreamId),
                seriesTitle: meta.seriesTitle,
                title: meta.title || meta.name,
                poster: meta.poster || meta.posterUrl || meta.thumbnail,
                url: meta.url,
            };
            await this.panelSync.saveProgress(
                null,
                pbInfo,
                Number(data.positionSeconds ?? 0),
                Number(data.durationSeconds ?? 0)
            );
        } catch (error) {
            console.error('Error al sincronizar progreso con el panel:', error);
        }
    }

    async getPlaybackPosition(
        playlistId: string,
        contentXtreamId: number,
        contentType: 'vod' | 'episode'
    ): Promise<PlaybackPositionData | null> {
        const fromPanel = await this.getPanelPosition(
            playlistId,
            contentXtreamId,
            contentType
        );
        if (fromPanel) return fromPanel;

        try {
            return await this.playbackPositionBridge.getPlaybackPosition(
                playlistId,
                contentXtreamId,
                contentType
            );
        } catch (error) {
            console.error('Error getting playback position:', error);
            return null;
        }
    }

    async getSeriesPlaybackPositions(
        playlistId: string,
        seriesXtreamId: number
    ): Promise<PlaybackPositionData[]> {
        let local: PlaybackPositionData[] = [];
        try {
            local = await this.playbackPositionBridge.getSeriesPlaybackPositions(
                playlistId,
                seriesXtreamId
            );
        } catch (error) {
            console.error('Error getting series playback positions:', error);
        }
        try {
            const tree = await this.panelSync.getAllProgress();
            const episodes = tree.Series[String(seriesXtreamId)] ?? {};
            const merged = new Map(
                local.map((p) => [p.contentXtreamId, p] as const)
            );
            for (const [episodeId, leaf] of Object.entries(episodes)) {
                merged.set(Number(episodeId), {
                    contentXtreamId: Number(episodeId),
                    contentType: 'episode',
                    seriesXtreamId,
                    positionSeconds: leaf.timeline,
                    durationSeconds: leaf.duration || undefined,
                    playlistId,
                    updatedAt: leaf.timestamp
                        ? new Date(leaf.timestamp * 1000).toISOString()
                        : undefined,
                });
            }
            return Array.from(merged.values());
        } catch {
            return local;
        }
    }

    async getRecentPlaybackPositions(
        playlistId: string,
        limit?: number
    ): Promise<PlaybackPositionData[]> {
        try {
            return await this.playbackPositionBridge.getRecentPlaybackPositions(
                playlistId,
                limit
            );
        } catch (error) {
            console.error('Error getting recent playback positions:', error);
            return [];
        }
    }

    async getAllPlaybackPositions(
        playlistId: string
    ): Promise<PlaybackPositionData[]> {
        try {
            return await this.playbackPositionBridge.getAllPlaybackPositions(
                playlistId
            );
        } catch (error) {
            console.error('Error getting all playback positions:', error);
            return [];
        }
    }

    async clearAllPlaybackPositions(playlistId: string): Promise<void> {
        try {
            await this.playbackPositionBridge.clearAllPlaybackPositions(
                playlistId
            );
        } catch (error) {
            console.error('Error clearing all playback positions:', error);
        }
    }

    async clearPlaybackPosition(
        playlistId: string,
        contentXtreamId: number,
        contentType: 'vod' | 'episode'
    ): Promise<void> {
        try {
            await this.playbackPositionBridge.clearPlaybackPosition(
                playlistId,
                contentXtreamId,
                contentType
            );
        } catch (error) {
            console.error('Error clearing playback position:', error);
        }

        try {
            const type = contentType === 'vod' ? 'movie' : 'series';
            await this.panelSync.removeProgress(
                null,
                type,
                String(contentXtreamId)
            );
        } catch {
            // The panel is unreachable; the next save overwrites the entry.
        }
    }

    private async getPanelPosition(
        playlistId: string,
        contentXtreamId: number,
        contentType: 'vod' | 'episode'
    ): Promise<PlaybackPositionData | null> {
        try {
            const entry = await this.panelSync.getPlaybackEntry(
                null,
                contentType === 'vod' ? 'movie' : 'series',
                contentXtreamId
            );
            if (!entry || !(entry.position > 0)) return null;
            return {
                contentXtreamId,
                contentType,
                seriesXtreamId: entry.seriesId
                    ? Number(entry.seriesId)
                    : undefined,
                positionSeconds: Math.floor(entry.position),
                durationSeconds: entry.duration || undefined,
                playlistId,
                updatedAt: entry.updatedAt,
            };
        } catch {
            return null;
        }
    }
}
