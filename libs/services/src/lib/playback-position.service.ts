// @ts-nocheck
import { inject, Injectable } from '@angular/core';
import { PlaybackPositionData } from '@iptvnator/shared/interfaces';
import { PlaybackPositionRuntimeBridgeService } from './playback-position-runtime-bridge.service';
import { FirebaseSyncService } from './firebase-sync.service';

@Injectable({
    providedIn: 'root',
})
export class PlaybackPositionService {
    private readonly playbackPositionBridge = inject(
        PlaybackPositionRuntimeBridgeService
    );
    private readonly firebaseSync = inject(FirebaseSyncService);

    private termLog(msg: string, data?: any) {
        try {
            const win = window as any;
            if (win.electron && win.electron.ipcRenderer) {
                win.electron.ipcRenderer.send('TERMINAL_LOG', msg, data || null);
            }
        } catch (e) {}
    }

    private getUserIdObj(): any {
        const username = localStorage.getItem('session_user') || '';
        const password = localStorage.getItem('session_pass') || '';
        const server = localStorage.getItem('session_server') || '';
        return { username, password, server };
    }

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
            const userIdObj = this.getUserIdObj();
            const posAny = data as any;
            
            let fbType = 'live';
            if (data.contentType === 'vod') fbType = 'movie';
            if (data.contentType === 'episode') fbType = 'series';

            // Ahora sí capturamos el título y póster real que inyectamos en el Feature Store
            const title = posAny.title || posAny.name || `Contenido ${data.contentXtreamId}`;
            const poster = posAny.poster || posAny.posterUrl || posAny.thumbnail || 'null';

            const currentTime = Number(data.positionSeconds ?? posAny.currentTime ?? posAny.position ?? posAny.time ?? 0);
            const duration = Number(data.durationSeconds ?? posAny.duration ?? 0);

            const pbInfo = {
                type: fbType,
                id: String(data.contentXtreamId),
                categoryId: String(data.seriesXtreamId || data.contentXtreamId),
                title: title,
                poster: poster
            };
            
            this.termLog(`[FIREBASE SYNC] 🚀 Enviando a la nube -> Título: "${title}" | Duración: ${duration}s | Timeline: ${currentTime}s`, pbInfo);

            if (currentTime > 5) {
                await this.firebaseSync.saveProgress(userIdObj, pbInfo, currentTime, duration);
            }
        } catch (error) {
            console.error('Error al sincronizar progreso con Firebase:', error);
        }
    }

    async getPlaybackPosition(
        playlistId: string,
        contentXtreamId: number,
        contentType: 'vod' | 'episode'
    ): Promise<PlaybackPositionData | null> {
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
        try {
            return await this.playbackPositionBridge.getSeriesPlaybackPositions(
                playlistId,
                seriesXtreamId
            );
        } catch (error) {
            console.error('Error getting series playback positions:', error);
            return [];
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
            const userIdObj = this.getUserIdObj();
            const type = contentType === 'vod' ? 'movie' : 'series';
            await this.firebaseSync.removeProgress(userIdObj, type, String(contentXtreamId), String(contentXtreamId));
        } catch (error) {}
    }
}