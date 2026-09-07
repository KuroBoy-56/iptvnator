// @ts-nocheck
import { computed, inject } from '@angular/core';
import { signalStore, withComputed, withMethods } from '@ngrx/signals';
import { XtreamSerieDetails, XtreamVodDetails } from '@iptvnator/shared/interfaces';

import { withFavorites } from '../with-favorites.feature';
import { withRecentItems } from '../with-recent-items';

import { XTREAM_DATA_SOURCE } from '../data-sources/xtream-data-source.interface';
import { XtreamApiService } from '../services/xtream-api.service';

import { TmdbEnrichmentService } from '@iptvnator/services';
import { createLogger } from '@iptvnator/portal/shared/util';
import {
    withContent,
    withEpg,
    withPlaybackPositions,
    withPlayer,
    withPortal,
    withSearch,
    withSelection,
} from './features';
import {
    enrichSerialSeasonWithTmdb,
    enrichSerialSelectionWithTmdb,
    enrichVodSelectionWithTmdb,
} from './xtream-tmdb-enrichment';

export const XtreamStore = signalStore(
    { providedIn: 'root' },

    withPortal(),
    withContent(),
    withSelection(),
    withSearch(),
    withEpg(),
    withPlayer(),
    withFavorites(),
    withRecentItems(),
    withPlaybackPositions(),

    withComputed((store) => ({
        globalRecentItems: computed(() => {
            return store.recentItems();
        }),
    })),

    withMethods((store) => {
        const xtreamApiService = inject(XtreamApiService);
        const dataSource = inject(XTREAM_DATA_SOURCE);
        const tmdbEnrichment = inject(TmdbEnrichmentService);
        const logger = createLogger('XtreamStore');
        const findVodCatalogItem = (vodId: string | number) =>
            store.vodStreams().find((item) => {
                const candidateId =
                    item.xtream_id ??
                    item.stream_id ??
                    (item as { id?: string | number }).id;

                return Number(candidateId) === Number(vodId);
            });

        return {
            resetStore(newPlaylistId?: string): void {
                const leavingPlaylistId = store.playlistId();
                const preserveCancelledBlock =
                    Boolean(newPlaylistId) &&
                    leavingPlaylistId === newPlaylistId &&
                    store.contentInitBlockReason() === 'cancelled';
                if (leavingPlaylistId) {
                    dataSource.clearSessionCache(leavingPlaylistId);
                }

                store.resetPortal();
                store.resetContent();
                store.resetSelection();
                store.resetSearchResults();
                store.clearEpg();
                store.resetPlayer();

                if (newPlaylistId) {
                    store.setPlaylistId(newPlaylistId);
                }

                if (preserveCancelledBlock) {
                    store.setContentInitBlockReason('cancelled');
                }
            },

            async initialize(): Promise<void> {
                await store.fetchPlaylist();
                await store.checkPortalStatus();
                await store.initializeContent();
                const playlist = store.currentPlaylist();
                if (playlist) {
                    store.loadAllPositions(playlist.id);
                }
            },

            async fetchXtreamPlaylist(): Promise<void> {
                await store.fetchPlaylist();
            },

            fetchVodDetailsWithMetadata(params: {
                vodId: string;
                categoryId: number;
            }): void {
                const playlist = store.currentPlaylist();
                if (!playlist) return;

                store.setIsLoadingDetails(true);
                store.setDetailsError(null);
                xtreamApiService
                    .getVodInfo(
                        {
                            serverUrl: playlist.serverUrl,
                            username: playlist.username,
                            password: playlist.password,
                        },
                        params.vodId
                    )
                    .then((vodDetails: XtreamVodDetails) => {
                        const catalogItem = findVodCatalogItem(params.vodId);

                        store.setSelectedCategory(params.categoryId);
                        store.setSelectedItem({
                            ...catalogItem,
                            ...vodDetails,
                            stream_id: params.vodId,
                            xtream_id:
                                catalogItem?.xtream_id ?? Number(params.vodId),
                        });
                        void enrichVodSelectionWithTmdb(
                            store,
                            tmdbEnrichment,
                            params.vodId
                        );
                    })
                    .catch((error: unknown) => {
                        logger.error('Error fetching VOD details', error);
                        store.setDetailsError(
                            error instanceof Error
                                ? error.message
                                : 'Unknown error'
                        );
                    })
                    .finally(() => {
                        store.setIsLoadingDetails(false);
                    });
            },

            fetchSerialDetailsWithMetadata(params: {
                serialId: string;
                categoryId: number;
            }): void {
                const playlist = store.currentPlaylist();
                if (!playlist) return;

                store.setIsLoadingDetails(true);
                store.setDetailsError(null);
                xtreamApiService
                    .getSeriesInfo(
                        {
                            serverUrl: playlist.serverUrl,
                            username: playlist.username,
                            password: playlist.password,
                        },
                        params.serialId
                    )
                    .then((serialDetails: XtreamSerieDetails) => {
                        store.setSelectedCategory(params.categoryId);
                        store.setSelectedItem({
                            ...serialDetails,
                            series_id: params.serialId,
                        });
                        void enrichSerialSelectionWithTmdb(
                            store,
                            tmdbEnrichment,
                            params.serialId
                        );
                    })
                    .catch((error: unknown) => {
                        logger.error('Error fetching series details', error);
                        store.setDetailsError(
                            error instanceof Error
                                ? error.message
                                : 'Unknown error'
                        );
                    })
                    .finally(() => {
                        store.setIsLoadingDetails(false);
                    });
            },

            enrichSelectedSerialSeason(seasonKey: string): void {
                void enrichSerialSeasonWithTmdb(
                    store,
                    tmdbEnrichment,
                    seasonKey
                );
            },
        };
    })
);

export type XtreamStoreType = InstanceType<typeof XtreamStore>;