import { Injectable, inject } from '@angular/core';
import { FirebaseSyncService } from '@iptvnator/services';
import {
    PORTAL_PLAYBACK_POSITIONS,
    PortalPlaybackPositions,
} from '@iptvnator/portal/shared/util';
import {
    PlaybackPositionData,
    XTREAM_DATA_SOURCE,
} from '@iptvnator/portal/xtream/data-access';

@Injectable({
    providedIn: 'root',
})
export class AppPortalPlaybackPositionsService
    implements PortalPlaybackPositions
{
    private readonly dataSource = inject(XTREAM_DATA_SOURCE);
    private readonly firebaseSync = inject(FirebaseSyncService, { optional: true });

    private getUserIdObj() {
        return {
            username: localStorage.getItem('session_user') || '',
            password: localStorage.getItem('session_pass') || '',
            server: localStorage.getItem('session_server') || ''
        };
    }

    async savePlaybackPosition(
        playlistId: string,
        data: PlaybackPositionData
    ): Promise<void> {
        await this.dataSource.savePlaybackPosition(playlistId, data);
    }

    async getPlaybackPosition(
        playlistId: string,
        contentXtreamId: number,
        contentType: 'vod' | 'episode'
    ): Promise<PlaybackPositionData | null> {
        const localPos = await this.dataSource.getPlaybackPosition(playlistId, contentXtreamId, contentType);
        
        try {
            if (this.firebaseSync) {
                const progress = await (this.firebaseSync as any).getAllProgress(this.getUserIdObj());
                if (progress) {
                    if (contentType === 'vod' && progress['Movie']?.[contentXtreamId]) {
                        const data = progress['Movie'][contentXtreamId];
                        if (data && data.timeline > 0) {
                            return {
                                contentXtreamId,
                                contentType,
                                positionSeconds: data.timeline,
                                durationSeconds: data.duration || (data.timeline * 1.25),
                                updatedAt: new Date((data.timestamp || 0) * 1000).toISOString()
                            };
                        }
                    } else if (contentType === 'episode' && progress['Series']) {
                        for (const sId of Object.keys(progress['Series'])) {
                            if (progress['Series'][sId]?.[contentXtreamId]) {
                                const data = progress['Series'][sId][contentXtreamId];
                                if (data && data.timeline > 0) {
                                    return {
                                        contentXtreamId,
                                        contentType,
                                        seriesXtreamId: Number(sId),
                                        positionSeconds: data.timeline,
                                        durationSeconds: data.duration || (data.timeline * 1.25),
                                        updatedAt: new Date((data.timestamp || 0) * 1000).toISOString()
                                    };
                                }
                            }
                        }
                    }
                }
            }
        } catch (e) {}
        
        return localPos;
    }

    async getSeriesPlaybackPositions(
        playlistId: string,
        seriesXtreamId: number
    ): Promise<PlaybackPositionData[]> {
        const local = await this.dataSource.getSeriesPlaybackPositions(playlistId, seriesXtreamId);
        const map = new Map<number, PlaybackPositionData>();
        local.forEach(p => map.set(p.contentXtreamId, p));
        
        try {
            if (this.firebaseSync) {
                const progress = await (this.firebaseSync as any).getAllProgress(this.getUserIdObj());
                if (progress?.['Series']?.[seriesXtreamId]) {
                    const eps = progress['Series'][seriesXtreamId];
                    for (const epId of Object.keys(eps)) {
                        const data = eps[epId];
                        if (data && data.timeline > 0) {
                            map.set(Number(epId), {
                                contentXtreamId: Number(epId),
                                contentType: 'episode',
                                seriesXtreamId,
                                positionSeconds: data.timeline,
                                durationSeconds: data.duration || (data.timeline * 1.25),
                                updatedAt: new Date((data.timestamp || 0) * 1000).toISOString()
                            });
                        }
                    }
                }
            }
        } catch (e) {}
        
        return Array.from(map.values());
    }

    async getAllPlaybackPositions(
        playlistId: string
    ): Promise<PlaybackPositionData[]> {
        const local = await this.dataSource.getAllPlaybackPositions(playlistId);
        const map = new Map<string, PlaybackPositionData>();
        local.forEach(p => map.set(`${p.contentType}-${p.contentXtreamId}`, p));
        
        try {
            if (this.firebaseSync) {
                const progress = await (this.firebaseSync as any).getAllProgress(this.getUserIdObj());
                if (progress) {
                    if (progress['Movie']) {
                        for (const mId of Object.keys(progress['Movie'])) {
                            const data = progress['Movie'][mId];
                            if (data && data.timeline > 0) {
                                map.set(`vod-${mId}`, {
                                    contentXtreamId: Number(mId),
                                    contentType: 'vod',
                                    positionSeconds: data.timeline,
                                    durationSeconds: data.duration || (data.timeline * 1.25),
                                    updatedAt: new Date((data.timestamp || 0) * 1000).toISOString()
                                });
                            }
                        }
                    }
                    if (progress['Series']) {
                        for (const sId of Object.keys(progress['Series'])) {
                            const eps = progress['Series'][sId];
                            for (const epId of Object.keys(eps)) {
                                const data = eps[epId];
                                if (data && data.timeline > 0) {
                                    map.set(`episode-${epId}`, {
                                        contentXtreamId: Number(epId),
                                        contentType: 'episode',
                                        seriesXtreamId: Number(sId),
                                        positionSeconds: data.timeline,
                                        durationSeconds: data.duration || (data.timeline * 1.25),
                                        updatedAt: new Date((data.timestamp || 0) * 1000).toISOString()
                                    });
                                }
                            }
                        }
                    }
                }
            }
        } catch (e) {}
        
        return Array.from(map.values());
    }

    async clearPlaybackPosition(
        playlistId: string,
        contentXtreamId: number,
        contentType: 'vod' | 'episode'
    ): Promise<void> {
        await this.dataSource.clearPlaybackPosition(
            playlistId,
            contentXtreamId,
            contentType
        );
    }
}

export const providePortalPlaybackPositions = () => [
    {
        provide: PORTAL_PLAYBACK_POSITIONS,
        useExisting: AppPortalPlaybackPositionsService,
    },
];