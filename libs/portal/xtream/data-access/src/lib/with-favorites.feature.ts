import { inject } from '@angular/core';
import {
    patchState,
    signalStoreFeature,
    withMethods,
    withState,
} from '@ngrx/signals';
import { createLogger } from '@iptvnator/portal/shared/util';
import { XTREAM_DATA_SOURCE } from './data-sources/xtream-data-source.interface';
import { FavoritesService } from './services/favorites.service';

export const withFavorites = function () {
    const logger = createLogger('withFavorites');
    return signalStoreFeature(
        withState({
            isFavorite: false,
        }),
        withMethods((
            store,
            dataSource = inject(XTREAM_DATA_SOURCE),
            favorites = inject(FavoritesService, { optional: true })
        ) => ({
            async toggleFavorite(
                xtreamId: number | string,
                playlistId: string,
                contentType: 'live' | 'movie' | 'series',
                backdropUrl?: string
            ) {
                const normalizedXtreamId = Number(xtreamId);
                if (
                    !Number.isFinite(normalizedXtreamId) ||
                    normalizedXtreamId <= 0 ||
                    !playlistId
                ) {
                    return false;
                }

                const content = await dataSource.getContentByXtreamId(
                    normalizedXtreamId,
                    playlistId,
                    contentType
                );
                const contentId =
                    content?.id ??
                    (!window.electron ? normalizedXtreamId : null);

                const currentStatus = store.isFavorite();

                if (contentId == null) {
                    // Not in the local cache yet (opened from search, the home rails…): the panel is the
                    // source of truth, so the change is saved there and the cache picks it up on its next sync.
                    if (!favorites) {
                        logger.error('Content not found for xtream ID', normalizedXtreamId);
                        return false;
                    }
                    patchState(store, { isFavorite: !currentStatus });
                    await favorites.syncPanelFavorite(!currentStatus, normalizedXtreamId, playlistId, contentType, {
                        poster: backdropUrl,
                    });
                    return !currentStatus;
                }

                if (currentStatus) {
                    // Remove from favorites
                    await dataSource.removeFavorite(contentId, playlistId);
                    patchState(store, { isFavorite: false });
                    void favorites?.syncPanelFavorite(false, normalizedXtreamId, playlistId, contentType);
                    return false;
                } else {
                    // Add to favorites
                    await dataSource.addFavorite(
                        contentId,
                        playlistId,
                        backdropUrl
                    );
                    patchState(store, { isFavorite: true });
                    void favorites?.syncPanelFavorite(true, normalizedXtreamId, playlistId, contentType, {
                        title: content?.title || content?.name,
                        poster: content?.poster_url || content?.stream_icon || backdropUrl,
                        categoryId: content?.category_id,
                    });
                    return true;
                }
            },

            async checkFavoriteStatus(
                xtreamId: number | string,
                playlistId: string,
                contentType: 'live' | 'movie' | 'series'
            ) {
                const normalizedXtreamId = Number(xtreamId);
                if (
                    !Number.isFinite(normalizedXtreamId) ||
                    normalizedXtreamId <= 0 ||
                    !playlistId
                ) {
                    patchState(store, { isFavorite: false });
                    return;
                }

                const content = await dataSource.getContentByXtreamId(
                    normalizedXtreamId,
                    playlistId,
                    contentType
                );
                const contentId =
                    content?.id ??
                    (!window.electron ? normalizedXtreamId : null);

                const local =
                    contentId == null
                        ? false
                        : await dataSource.isFavorite(contentId, playlistId);
                patchState(store, { isFavorite: local });

                // the panel decides (it may have been added or removed on the web or on Android)
                const remote = await favorites?.panelStatus(normalizedXtreamId, playlistId, contentType);
                if (remote == null || remote === local) return;
                patchState(store, { isFavorite: remote });
                if (contentId == null) return;
                try {
                    if (remote) await dataSource.addFavorite(contentId, playlistId);
                    else await dataSource.removeFavorite(contentId, playlistId);
                } catch {
                    // the periodic panel sync repairs the local cache
                }
            },
        }))
    );
};
