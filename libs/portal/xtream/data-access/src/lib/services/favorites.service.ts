import { inject, Injectable } from '@angular/core';
import { from, map, Observable, firstValueFrom } from 'rxjs';
import { XTREAM_DATA_SOURCE } from '../data-sources/xtream-data-source.interface';
import { FavoriteItem } from './favorite-item.interface';
import { PanelSyncService } from '@iptvnator/services';
import { Store } from '@ngrx/store';
import { selectAllPlaylistsMeta } from '@iptvnator/m3u-state';
import { getSessionPassword } from '@iptvnator/shared/interfaces';

function normalizeCategoryId(categoryId: string | number): number {
    const numericCategoryId = Number(categoryId);
    return Number.isFinite(numericCategoryId) ? numericCategoryId : 0;
}

@Injectable({
    providedIn: 'root',
})
export class FavoritesService {
    private dataSource = inject(XTREAM_DATA_SOURCE);
    private panelSync = inject(PanelSyncService);
    private store = inject(Store);

    private async getUserIdObj(playlistId: string): Promise<any> {
        try {
            const playlists = await firstValueFrom(this.store.select(selectAllPlaylistsMeta));
            const activePl = playlists.find(p => p._id === playlistId);
            
            if (activePl) {
                return {
                    username: activePl.username,
                    password: activePl.password,
                    server: activePl.serverUrl
                };
            }
        } catch { /* best effort */ }

        return {
            username: localStorage.getItem('session_user') || '',
            password: getSessionPassword(),
            server: localStorage.getItem('session_server') || ''
        };
    }

    async addToFavorites(item: {
        content_id: number;
        playlist_id: string;
        backdrop_url?: string;
        type?: string; 
    }): Promise<void> {
        
        await this.dataSource.addFavorite(
            item.content_id,
            item.playlist_id,
            item.backdrop_url
        );

        await new Promise(r => setTimeout(r, 500)); 

        try {
            const userIdObj = await this.getUserIdObj(item.playlist_id);
            let fbType = 'LiveTv';
            if (item.type === 'movie' || item.type === 'vod') fbType = 'Movie';
            if (item.type === 'series') fbType = 'Series';

            const timestamp = Math.floor(Date.now() / 1000);
            const meta: any = { thumbnail: item.backdrop_url || '', title: '' };
            
            try {
                const favs = await firstValueFrom(this.getFavorites(item.playlist_id));
                const matched = favs.find(f => f.content_id === item.content_id);
                if (matched) {
                    meta.title = matched.title;
                    meta.thumbnail = matched.poster_url || item.backdrop_url || '';
                } else {
                    const win = window as any;
                    const ipc = win.electron?.ipcRenderer;
                    if (ipc) {
                        const content = await ipc.invoke('DB_GET_CONTENT_BY_XTREAM_ID', {
                            xtreamId: item.content_id,
                            playlistId: item.playlist_id
                        });
                        const realContent = Array.isArray(content) ? content[0] : content;
                        if (realContent) {
                            meta.title = realContent.title;
                            meta.thumbnail = realContent.poster_url || realContent.backdrop_url || realContent.logo || item.backdrop_url || '';
                        }
                    }
                }
            } catch { /* best effort */ }

            const finalTitle = meta.title && meta.title !== 'null' && !/^Contenido \d+$/.test(meta.title) ? meta.title : `Canal ${item.content_id}`;
            meta.title = finalTitle;

            await this.panelSync.addFavorite(userIdObj, fbType, String(item.content_id), timestamp, meta);
        } catch { /* best effort */ }
    }

    async removeFromFavorites(
        contentId: number,
        playlistId: string,
        type?: string
    ): Promise<void> {
        
        await this.dataSource.removeFavorite(contentId, playlistId);

        try {
            const userIdObj = await this.getUserIdObj(playlistId);
            let fbType = 'LiveTv';
            if (type === 'movie' || type === 'vod') fbType = 'Movie';
            if (type === 'series') fbType = 'Series';

            await this.panelSync.removeFavorite(userIdObj, fbType, String(contentId));
        } catch { /* best effort */ }
    }

    async isFavorite(contentId: number, playlistId: string): Promise<boolean> {
        return await this.dataSource.isFavorite(contentId, playlistId);
    }

    getFavorites(playlistId: string): Observable<FavoriteItem[]> {
        return from(this.dataSource.getFavorites(playlistId)).pipe(
            map((items) =>
                items.map((item) => ({
                    content_id: item.id,
                    playlist_id: playlistId,
                    type: item.type as FavoriteItem['type'],
                    title: item.title,
                    poster_url: item.poster_url,
                    added_at: item.added_at,
                    category_id: normalizeCategoryId(item.category_id),
                    xtream_id: item.xtream_id,
                }))
            )
        );
    }
}