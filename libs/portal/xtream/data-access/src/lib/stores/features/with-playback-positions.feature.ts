// @ts-nocheck
import { inject } from '@angular/core';
import {
    patchState,
    signalStoreFeature,
    withHooks,
    withMethods,
    withState,
} from '@ngrx/signals';
import { XtreamSerieEpisode } from '@iptvnator/shared/interfaces';
import { PlaybackPositionRuntimeBridgeService } from '@iptvnator/services';
import {
    PlaybackPositionData,
    XTREAM_DATA_SOURCE,
} from '../../data-sources/xtream-data-source.interface';

export interface PlaybackPositionsState {
    playbackPositions: Map<string, PlaybackPositionData>; // key: `${contentType}_${xtreamId}`
    seriesPositions: Map<number, PlaybackPositionData[]>; // key: seriesXtreamId
}

const initialState: PlaybackPositionsState = {
    playbackPositions: new Map(),
    seriesPositions: new Map(),
};

function parseDuration(duration: string | number): number {
    if (typeof duration === 'number') return duration;
    if (!duration) return 0;

    const minMatch = duration.match(/(\d+)\s*min/);
    if (minMatch) {
        return parseInt(minMatch[1], 10) * 60;
    }

    if (duration.includes(':')) {
        const parts = duration.split(':').map((p) => parseInt(p, 10));
        if (parts.length === 3) {
            return parts[0] * 3600 + parts[1] * 60 + parts[2];
        } else if (parts.length === 2) {
            return parts[0] * 60 + parts[1];
        }
    }

    const num = parseInt(duration, 10);
    if (!isNaN(num)) {
        return num;
    }

    return 0;
}

export function withPlaybackPositions() {
    return signalStoreFeature(
        withState(initialState),

        withMethods((store) => {
            const dataSource = inject(XTREAM_DATA_SOURCE);

            const getPositionKey = (type: string, id: number) =>
                `${type}_${id}`;

            return {
                getProgressPercent(
                    contentXtreamId: number,
                    contentType: 'vod' | 'episode'
                ): number {
                    const key = getPositionKey(contentType, contentXtreamId);
                    const position = store.playbackPositions().get(key);

                    if (!position || !position.durationSeconds) return 0;

                    const percent =
                        (position.positionSeconds / position.durationSeconds) *
                        100;

                    if (position.positionSeconds > 10 && percent < 1) {
                        return 1;
                    }

                    return Math.min(100, Math.round(percent));
                },

                isWatched(
                    contentXtreamId: number,
                    contentType: 'vod' | 'episode'
                ): boolean {
                    return (
                        this.getProgressPercent(contentXtreamId, contentType) >=
                        90
                    );
                },

                isInProgress(
                    contentXtreamId: number,
                    contentType: 'vod' | 'episode'
                ): boolean {
                    const key = getPositionKey(contentType, contentXtreamId);
                    const position = store.playbackPositions().get(key);
                    if (!position) return false;

                    const percent = this.getProgressPercent(
                        contentXtreamId,
                        contentType
                    );
                    const inProgress =
                        position.positionSeconds > 10 && percent < 90;
                    return inProgress;
                },

                async loadAllPositions(playlistId: string): Promise<void> {
                    const positions =
                        await dataSource.getAllPlaybackPositions(playlistId);

                    const positionsMap = new Map<
                        string,
                        PlaybackPositionData
                    >();
                    const seriesMap = new Map<number, PlaybackPositionData[]>();

                    positions.forEach((pos) => {
                        const key = getPositionKey(
                            pos.contentType,
                            pos.contentXtreamId
                        );
                        positionsMap.set(key, pos);

                        if (
                            pos.contentType === 'episode' &&
                            pos.seriesXtreamId
                        ) {
                            const existing =
                                seriesMap.get(pos.seriesXtreamId) || [];
                            existing.push(pos);
                            seriesMap.set(pos.seriesXtreamId, existing);
                        }
                    });

                    patchState(store, {
                        playbackPositions: positionsMap,
                        seriesPositions: seriesMap,
                    });
                },

                hasSeriesProgress(seriesXtreamId: number): boolean {
                    const positions = store
                        .seriesPositions()
                        .get(seriesXtreamId);
                    return positions !== undefined && positions.length > 0;
                },

                async loadVodPosition(
                    playlistId: string,
                    vodXtreamId: number
                ): Promise<void> {
                    const position = await dataSource.getPlaybackPosition(
                        playlistId,
                        vodXtreamId,
                        'vod'
                    );

                    if (position) {
                        const key = getPositionKey('vod', vodXtreamId);
                        const updated = new Map(store.playbackPositions());
                        updated.set(key, position);
                        patchState(store, { playbackPositions: updated });
                    }
                },

                async loadSeriesPositions(
                    playlistId: string,
                    seriesXtreamId: number
                ): Promise<void> {
                    const positions =
                        await dataSource.getSeriesPlaybackPositions(
                            playlistId,
                            seriesXtreamId
                        );

                    const updated = new Map(store.seriesPositions());
                    updated.set(seriesXtreamId, positions);
                    patchState(store, { seriesPositions: updated });

                    const positionsMap = new Map(store.playbackPositions());
                    positions.forEach((pos) => {
                        const key = getPositionKey(
                            'episode',
                            pos.contentXtreamId
                        );
                        positionsMap.set(key, pos);
                    });
                    patchState(store, { playbackPositions: positionsMap });
                },

                /**
                 * ENRIQUECIMIENTO DE METADATOS (Título, Póster y Duración real)
                 */
                async savePosition(
                    playlistId: string,
                    data: PlaybackPositionData
                ): Promise<void> {
                    try {
                        const selected: any = store.selectedItem?.();
                        if (selected) {
                            if (data.contentType === 'vod') {
                                (data as any).title = selected.name || selected.title || selected.original_title;
                                (data as any).poster = selected.cover || selected.poster_url || selected.stream_icon;
                                if (!data.durationSeconds && (selected.duration_secs || selected.duration)) {
                                    data.durationSeconds = parseDuration(selected.duration_secs || selected.duration);
                                }
                            } else if (data.contentType === 'episode' && selected.episodes) {
                                // The panel keeps one entry per series, keyed by the series name.
                                (data as any).seriesTitle = selected.info?.name || selected.name || selected.title;
                                let foundEp: any = null;
                                for (const seasonNum of Object.keys(selected.episodes)) {
                                    const eps = selected.episodes[seasonNum];
                                    const match = eps.find((e: any) => Number(e.id) === Number(data.contentXtreamId));
                                    if (match) {
                                        foundEp = match;
                                        break;
                                    }
                                }
                                if (foundEp) {
                                    (data as any).title = foundEp.title || foundEp.name || `Episodio ${foundEp.episode_num}`;
                                    (data as any).poster = foundEp.info?.movie_image || selected.cover || selected.poster_url;
                                    if (!data.durationSeconds && (foundEp.info?.duration_secs || foundEp.info?.duration)) {
                                        data.durationSeconds = parseDuration(foundEp.info.duration_secs || foundEp.info.duration);
                                    }
                                } else {
                                    (data as any).title = selected.name || selected.title;
                                    (data as any).poster = selected.cover || selected.poster_url;
                                }
                            }
                        }
                    } catch (e) {
                        console.error('Error enriqueciendo metadatos:', e);
                    }

                    await dataSource.savePlaybackPosition(playlistId, data);

                    const key = getPositionKey(
                        data.contentType,
                        data.contentXtreamId
                    );
                    const updated = new Map(store.playbackPositions());
                    updated.set(key, data);
                    patchState(store, { playbackPositions: updated });
                },

                async toggleEpisodeWatched(
                    playlistId: string,
                    episode: XtreamSerieEpisode,
                    seriesId: number
                ): Promise<void> {
                    const id = Number(episode.id);
                    const isWatched = this.isWatched(id, 'episode');

                    if (isWatched) {
                        await dataSource.clearPlaybackPosition(
                            playlistId,
                            id,
                            'episode'
                        );
                        const key = getPositionKey('episode', id);
                        const updated = new Map(store.playbackPositions());
                        updated.delete(key);

                        const seriesMap = new Map(store.seriesPositions());
                        const seriesEpisodes = seriesMap.get(seriesId) || [];
                        const filteredEpisodes = seriesEpisodes.filter(
                            (p) => p.contentXtreamId !== id
                        );
                        if (filteredEpisodes.length === 0) {
                            seriesMap.delete(seriesId);
                        } else {
                            seriesMap.set(seriesId, filteredEpisodes);
                        }

                        patchState(store, {
                            playbackPositions: updated,
                            seriesPositions: seriesMap,
                        });
                    } else {
                        let duration = 0;
                        const info = Array.isArray(episode.info)
                            ? null
                            : episode.info;

                        if (info?.duration_secs) {
                            duration = info.duration_secs;
                        } else if (info?.duration) {
                            duration = parseDuration(info.duration);
                        }

                        if (duration === 0) duration = 1;

                        const data: PlaybackPositionData = {
                            contentXtreamId: id,
                            contentType: 'episode',
                            seriesXtreamId: seriesId,
                            seasonNumber: Number(episode.season),
                            episodeNumber: Number(episode.episode_num),
                            positionSeconds: duration,
                            durationSeconds: duration,
                            playlistId,
                            updatedAt: new Date().toISOString(),
                        };

                        await this.savePosition(playlistId, data);

                        const seriesMap = new Map(store.seriesPositions());
                        const seriesEpisodes = seriesMap.get(seriesId) || [];
                        const existingIdx = seriesEpisodes.findIndex(
                            (p) => p.contentXtreamId === id
                        );
                        if (existingIdx >= 0) {
                            seriesEpisodes[existingIdx] = data;
                        } else {
                            seriesEpisodes.push(data);
                        }
                        seriesMap.set(seriesId, seriesEpisodes);

                        patchState(store, {
                            seriesPositions: seriesMap,
                        });
                    }
                },
            };
        }),

        withHooks((store) => {
            const playbackPositionBridge = inject(
                PlaybackPositionRuntimeBridgeService
            );
            let unsubscribe: (() => void) | undefined;

            return {
                onInit() {
                    unsubscribe =
                        playbackPositionBridge.onPlaybackPositionUpdate(
                            (data: PlaybackPositionData) => {
                                if (!data.playlistId) {
                                    return;
                                }

                                store.savePosition(data.playlistId, data);
                            }
                        );
                },
                onDestroy() {
                    unsubscribe?.();
                },
            };
        })
    );
}