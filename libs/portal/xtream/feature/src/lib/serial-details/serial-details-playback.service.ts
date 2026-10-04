import {
    computed,
    DestroyRef,
    effect,
    inject,
    Injectable,
    Signal,
    signal,
} from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import {
    PORTAL_EXTERNAL_PLAYBACK,
    PORTAL_PLAYBACK_POSITIONS,
    PORTAL_PLAYER,
    getSeriesQuickStartAction,
} from '@iptvnator/portal/shared/util';
import { XtreamStore } from '@iptvnator/portal/xtream/data-access';
import { PlaybackPositionRuntimeBridgeService, SettingsStore, PanelSyncService } from '@iptvnator/services';
import {
    PlaybackPositionData,
    PlayerContentInfo,
    ResolvedPortalPlayback,
    XtreamSerieDetails,
    XtreamSerieEpisode,
} from '@iptvnator/shared/interfaces';
import { SeasonContainerPlaybackToggleRequest } from '@iptvnator/ui/components';
import {
    getSeriesEpisodeMetadata,
    getSeriesPlaybackNavigation,
    type PlaybackFallbackRequest,
    resolveSeriesPlaybackEpisodeState,
    type SeriesPlaybackEpisodeState,
} from '@iptvnator/ui/playback';

export type XtreamSerieDetailsView = XtreamSerieDetails & {
    readonly series_id: number;
};

interface SerialDetailsPlaybackBindings {
    readonly selectedItem: Signal<XtreamSerieDetailsView | null>;
}

@Injectable()
export class SerialDetailsPlaybackService {
    private readonly route = inject(ActivatedRoute);
    private readonly xtreamStore = inject(XtreamStore);
    private readonly playbackPositions = inject(PORTAL_PLAYBACK_POSITIONS);
    private readonly playbackPositionBridge = inject(PlaybackPositionRuntimeBridgeService);
    private readonly portalPlayer = inject(PORTAL_PLAYER);
    private readonly externalPlayback = inject(PORTAL_EXTERNAL_PLAYBACK);
    private readonly settingsStore = inject(SettingsStore);
    private readonly panelSync = inject(PanelSyncService, { optional: true });

    private readonly bindings = signal<SerialDetailsPlaybackBindings | null>(null);
    private readonly currentPlaylistId = computed(() => this.xtreamStore.currentPlaylist()?.id ?? '');
    private lastSaveTime = 0;

    readonly inlinePlayback = signal<ResolvedPortalPlayback | null>(null);
    readonly episodePlaybackPositions = signal<Map<number, PlaybackPositionData>>(new Map());
    readonly openingEpisodeId = signal<number | null>(null);
    readonly activeEpisodeId = signal<number | null>(null);

    readonly quickStartAction = computed(() => {
        const item = this.selectedItem();
        if (!item) return null;
        return getSeriesQuickStartAction({ seasons: item.episodes ?? {}, playbackPositions: this.episodePlaybackPositions() });
    });

    readonly inlineEpisodeState = computed<SeriesPlaybackEpisodeState<XtreamSerieEpisode> | null>(() => this.getInlineEpisodeState());
    readonly inlineEpisodeMetadata = computed(() => getSeriesEpisodeMetadata(this.inlineEpisodeState()));
    readonly inlineSeriesNavigation = computed(() => getSeriesPlaybackNavigation(this.inlineEpisodeState()));

    constructor() {
        effect(() => {
            const session = this.externalPlayback.activeSession();
            const selectedItem = this.selectedItem();
            const playlistId = this.currentPlaylistId();

            if (!session?.contentInfo || !selectedItem?.series_id || !playlistId || session.contentInfo.contentType !== 'episode' || session.contentInfo.playlistId !== playlistId || session.contentInfo.seriesXtreamId !== Number(selectedItem.series_id)) {
                this.openingEpisodeId.set(null);
                this.activeEpisodeId.set(null);
                return;
            }

            if (session.status === 'launching') {
                this.openingEpisodeId.set(session.contentInfo.contentXtreamId);
                this.activeEpisodeId.set(null);
                return;
            }

            if (session.status === 'opened' || session.status === 'playing') {
                this.openingEpisodeId.set(null);
                this.activeEpisodeId.set(session.contentInfo.contentXtreamId);
                return;
            }

            this.openingEpisodeId.set(null);
            this.activeEpisodeId.set(null);
        });

        const unsubscribePositionUpdates = this.playbackPositionBridge.onPlaybackPositionUpdate((data: PlaybackPositionData) => {
            const selectedItem = this.selectedItem();
            if (data.contentType !== 'episode' || data.playlistId !== this.currentPlaylistId() || data.seriesXtreamId !== Number(selectedItem?.series_id ?? 0)) return;
            this.updateEpisodePlaybackPosition(data);
        }) ?? null;

        inject(DestroyRef).onDestroy(() => { unsubscribePositionUpdates?.(); });
    }

    bind(bindings: SerialDetailsPlaybackBindings): void {
        this.bindings.set(bindings);
    }

    resetForNewSeries(): void {
        this.closeInlinePlayer();
        this.episodePlaybackPositions.set(new Map());
        this.openingEpisodeId.set(null);
        this.activeEpisodeId.set(null);
    }

    playEpisode(episode: XtreamSerieEpisode): void {
        const playlist = this.xtreamStore.currentPlaylist();
        const selectedItem = this.selectedItem();
        if (!playlist || !selectedItem) return;

        this.addToRecentlyViewed(this.route.snapshot.params['serialId']);

        const streamUrl = this.xtreamStore.constructEpisodeStreamUrl(episode);
        const contentInfo: PlayerContentInfo = { playlistId: playlist.id, contentXtreamId: Number(episode.id), contentType: 'episode', seriesXtreamId: Number(selectedItem.series_id), seasonNumber: Number(episode.season), episodeNumber: Number(episode.episode_num) };
        const position = this.episodePlaybackPositions().get(Number(episode.id));

        const playback: ResolvedPortalPlayback = { streamUrl, title: episode.title, thumbnail: selectedItem.info.cover, startTime: position?.positionSeconds, contentInfo };
        this.startPlayback(playback);
    }

    playQuickStartEpisode(): void {
        const action = this.quickStartAction();
        if (!action || action.disabled) return;
        this.playEpisode(action.episode);
    }

    playPreviousEpisode(): void {
        const previous = this.inlineEpisodeState()?.previous;
        if (!previous) return;
        this.playEpisode(previous);
    }

    playNextEpisode(): void {
        const next = this.inlineEpisodeState()?.next;
        if (!next) return;
        this.playEpisode(next);
    }

    handleInlinePlaybackEnded(): void {
        const navigation = this.inlineSeriesNavigation();
        if (!navigation?.autoplayEnabled || !navigation.canNext) return;
        this.playNextEpisode();
    }

    closeInlinePlayer(): void {
        this.inlinePlayback.set(null);
        this.lastSaveTime = 0;
    }

    handleInlineTimeUpdate(event: { currentTime: number; duration: number }): void {
        const playback = this.inlinePlayback();
        if (!playback?.contentInfo) return;

        const now = Date.now();
        if (now - this.lastSaveTime <= 15000) return;

        this.lastSaveTime = now;
        const position: PlaybackPositionData = { ...playback.contentInfo, positionSeconds: Math.floor(event.currentTime), durationSeconds: Math.floor(event.duration) };
        void this.playbackPositions.savePlaybackPosition(playback.contentInfo.playlistId, position);
        this.updateEpisodePlaybackPosition(position);
    }

    handleExternalFallbackRequest(request: PlaybackFallbackRequest): void {
        void this.portalPlayer.openExternalPlayback(request.playback, request.player);
    }

    async handlePlaybackToggleRequested(request: SeasonContainerPlaybackToggleRequest): Promise<void> {
        const playlistId = this.currentPlaylistId();
        if (!playlistId) return;

        if (request.nextPosition) {
            await this.playbackPositions.savePlaybackPosition(playlistId, request.nextPosition);
            this.updateEpisodePlaybackPosition(request.nextPosition);
            return;
        }

        await this.playbackPositions.clearPlaybackPosition(playlistId, request.contentXtreamId, 'episode');
        this.removeEpisodePlaybackPosition(request.contentXtreamId);
    }

    async loadSeriesPlaybackPositions(playlistId: string, seriesXtreamId: number): Promise<void> {
        const positions = await this.playbackPositions.getSeriesPlaybackPositions(playlistId, seriesXtreamId);
        const positionsMap = new Map<number, PlaybackPositionData>();
        positions.forEach((position) => { positionsMap.set(position.contentXtreamId, position); });

        try {
            const playlist = this.xtreamStore.currentPlaylist();
            if (playlist && this.panelSync) {
                const userIdObj = { username: playlist.username, password: playlist.password, server: playlist.serverUrl };
                const progress = await (this.panelSync as any).getAllProgress(userIdObj);
                
                if (progress && progress['Series'] && progress['Series'][seriesXtreamId]) {
                    const episodes = progress['Series'][seriesXtreamId];
                    for (const epId of Object.keys(episodes)) {
                        const data = episodes[epId];
                        
                        if (data && (data.timeline > 0 || data.timestamp || data.showInContinueWatchingList)) {
                            const existing = positionsMap.get(Number(epId));
                            
                            // LA JUGADA MAESTRA: Si el panel no envía timeline, mantenemos el que VLC guardó localmente.
                            const finalTimeline = data.timeline > 0 ? data.timeline : (existing?.positionSeconds || 0);
                            const finalDuration = data.duration > 0 ? data.duration : (existing?.durationSeconds || (finalTimeline ? finalTimeline * 1.25 : 0));

                            positionsMap.set(Number(epId), {
                                contentXtreamId: Number(epId),
                                contentType: 'episode',
                                seriesXtreamId: seriesXtreamId,
                                positionSeconds: finalTimeline,
                                durationSeconds: finalDuration,
                                updatedAt: new Date((data.timestamp || 0) * 1000).toISOString()
                            });
                        }
                    }
                }
            }
        } catch(e) {}

        this.episodePlaybackPositions.set(positionsMap);
    }

    private selectedItem(): XtreamSerieDetailsView | null {
        return this.bindings()?.selectedItem() ?? null;
    }

    private addToRecentlyViewed(xtreamId: string | number): void {
        this.xtreamStore.addRecentItem({ xtreamId: Number(xtreamId), contentType: 'series', playlist: this.xtreamStore.currentPlaylist, backdropUrl: this.selectedItem()?.info?.backdrop_path?.[0] });
    }

    private startPlayback(playback: ResolvedPortalPlayback): void {
        this.lastSaveTime = 0;
        
        if (this.portalPlayer.isEmbeddedPlayer()) {
            this.inlinePlayback.set(playback);
            return;
        }

        this.closeInlinePlayer();
        void this.portalPlayer.openResolvedPlayback(playback, true);
    }

    private getInlineEpisodeState(): SeriesPlaybackEpisodeState<XtreamSerieEpisode> | null {
        const playback = this.inlinePlayback();
        const episodesBySeason = this.selectedItem()?.episodes;
        const currentEpisodeId = playback?.contentInfo?.contentXtreamId;

        if (!episodesBySeason || playback?.contentInfo?.contentType !== 'episode' || currentEpisodeId === undefined) return null;
        return resolveSeriesPlaybackEpisodeState({ episodesBySeason, currentEpisodeId, fallbackSeasonNumber: playback.contentInfo.seasonNumber, fallbackEpisodeNumber: playback.contentInfo.episodeNumber });
    }

    private updateEpisodePlaybackPosition(position: PlaybackPositionData): void {
        const updated = new Map(this.episodePlaybackPositions());
        updated.set(position.contentXtreamId, position);
        this.episodePlaybackPositions.set(updated);
    }

    private removeEpisodePlaybackPosition(contentXtreamId: number): void {
        const updated = new Map(this.episodePlaybackPositions());
        updated.delete(contentXtreamId);
        this.episodePlaybackPositions.set(updated);
    }
}