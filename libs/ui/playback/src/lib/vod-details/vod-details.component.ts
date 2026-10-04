import { Component, computed, effect, inject, input, output, signal, untracked, NgZone } from '@angular/core';
import { MatIcon } from '@angular/material/icon';
import { TranslatePipe } from '@ngx-translate/core';
import { SafePipe } from '@iptvnator/pipes';
import { PORTAL_EXTERNAL_PLAYBACK } from '@iptvnator/portal/shared/util';
import {
    DetailActionsTemplateDirective,
    DetailMetaTemplateDirective,
    DetailTagsTemplateDirective,
    PortalDetailShellComponent,
} from '@iptvnator/ui/components';
import { Router } from '@angular/router';
import {
    ExternalPlayerSession,
    ResolvedPortalPlayback,
    TmdbEnrichedCastMember,
    VodDetailsItem,
    getVodNumericId,
    normalizeVodDetails,
    youtubeEmbedUrl,
    getSessionPassword,
} from '@iptvnator/shared/interfaces';
import {
    CrossPortalSimilarItem,
    CrossPortalSimilarService,
    DownloadsService,
    PanelSyncService
} from '@iptvnator/services';
import type { PlaybackFallbackRequest } from '../playback-diagnostics/playback-diagnostics.util';
import { PortalInlinePlayerComponent } from '../portal-inline-player/portal-inline-player.component';

@Component({
    selector: 'app-vod-details',
    templateUrl: './vod-details.component.html',
    styleUrls: ['../styles/detail-view.scss'],
    imports: [
        DetailActionsTemplateDirective,
        DetailMetaTemplateDirective,
        DetailTagsTemplateDirective,
        MatIcon,
        PortalDetailShellComponent,
        PortalInlinePlayerComponent,
        SafePipe,
        TranslatePipe,
    ],
})
export class VodDetailsComponent {
    readonly item = input.required<VodDetailsItem>();
    readonly isFavorite = input<boolean>(false);
    readonly playbackPosition = input<number | null>(null);
    readonly inlinePlayback = input<ResolvedPortalPlayback | null>(null);
    readonly externalPlayback = input<ExternalPlayerSession | null>(null);

    readonly playClicked = output<VodDetailsItem>();
    readonly resumeClicked = output<{ item: VodDetailsItem; positionSeconds: number }>();
    readonly favoriteToggled = output<{ item: VodDetailsItem; isFavorite: boolean }>();
    readonly backClicked = output<void>();
    readonly downloadRequested = output<VodDetailsItem>();
    readonly inlineTimeUpdated = output<{ currentTime: number; duration: number; }>();
    readonly inlinePlaybackClosed = output<void>();
    readonly streamUrlCopied = output<void>();
    readonly inlineExternalFallbackRequested = output<PlaybackFallbackRequest>();

    private readonly downloadsService = inject(DownloadsService);
    private readonly crossPortalSimilar = inject(CrossPortalSimilarService);
    private readonly externalPlaybackActions = inject(PORTAL_EXTERNAL_PLAYBACK);
    private readonly router = inject(Router);
    private readonly panelSync = inject(PanelSyncService);
    private readonly ngZone = inject(NgZone);

    readonly panelPosition = signal<number | null>(null);
    readonly effectivePlaybackPosition = computed(() => this.panelPosition() ?? this.playbackPosition());

    readonly isElectron = computed(() => this.downloadsService.isAvailable());

    readonly normalizedMeta = computed(() => {
        return normalizeVodDetails(this.item());
    });

    readonly trailerEmbedUrl = computed(() =>
        youtubeEmbedUrl(this.normalizedMeta().youtubeTrailer)
    );

    readonly isDemoAccount = computed(() => {
        const currentItem = this.item();
        if (!currentItem || !currentItem.playlistId) return false;
        return localStorage.getItem(`is_demo_${currentItem.playlistId}`) === 'true';
    });

    readonly similarInPortals = signal<CrossPortalSimilarItem[]>([]);

    private readonly loadSimilarInPortals = effect(() => {
        const meta = this.normalizedMeta();
        const recommendations = meta.tmdbRecommendations;
        untracked(() => {
            this.similarInPortals.set([]);
            if (
                !recommendations?.length ||
                !this.crossPortalSimilar.isAvailable
            ) {
                return;
            }
            void this.crossPortalSimilar
                .matchRecommendations(recommendations, 'movie')
                .then((items) => {
                    if (
                        this.normalizedMeta().tmdbRecommendations ===
                        recommendations
                    ) {
                        this.similarInPortals.set(items);
                    }
                });
        });
    });

    constructor() {
        effect((onCleanup) => {
            const item = this.item();
            if (!item) return;

            const itemAny = item as any;

            const username = localStorage.getItem('session_user') || '';
            const password = getSessionPassword();
            const server = localStorage.getItem('session_server') || '';

            const userIdObj = { username, password, server };
            const pbInfo = {
                type: 'movie',
                id: getVodNumericId(item),
                title: itemAny.name || itemAny.title || 'Película',
                poster: itemAny.posterUrl || itemAny.logo || itemAny.stream_icon || itemAny.cover || '',
                categoryId: itemAny.categoryId || itemAny.category_id || "0",
                playlistId: item.playlistId
            };

            const fetchProgress = async () => {
                const pos = await this.panelSync.getProgress(userIdObj, pbInfo);
                if (pos > 5) {
                    this.panelPosition.set(pos);
                }
            };

            fetchProgress();
            const intervalId = setInterval(fetchProgress, 5000);
            onCleanup(() => clearInterval(intervalId));
        });
    }

    openSimilarInPortals(item: CrossPortalSimilarItem): void {
        void this.router.navigate(this.crossPortalSimilar.buildLink(item));
    }

    readonly hasPlaybackPosition = computed(() => {
        const pos = this.effectivePlaybackPosition();
        return pos !== null && pos > 0;
    });

    readonly formattedPosition = computed(() => {
        const pos = this.effectivePlaybackPosition();
        if (!pos || pos <= 0) return '';

        const hours = Math.floor(pos / 3600);
        const minutes = Math.floor((pos % 3600) / 60);
        const seconds = Math.floor(pos % 60);

        if (hours > 0) {
            return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
        }
        return `${minutes}:${seconds.toString().padStart(2, '0')}`;
    });

    readonly isDownloaded = computed(() => {
        const item = this.item();
        this.downloadsService.downloads();
        const vodId = getVodNumericId(item);
        return this.downloadsService.isDownloaded(vodId, item.playlistId, 'vod');
    });

    readonly isDownloading = computed(() => {
        const item = this.item();
        this.downloadsService.downloads();
        const vodId = getVodNumericId(item);
        return this.downloadsService.isDownloading(vodId, item.playlistId, 'vod');
    });

    readonly matchedExternalPlayback = computed(() => {
        const session = this.externalPlayback();
        const item = this.item();
        if (
            !session?.contentInfo ||
            session.status === 'closed' ||
            session.status === 'error'
        ) {
            return null;
        }

        const contentInfo = session.contentInfo;
        if (
            contentInfo.playlistId !== item.playlistId ||
            contentInfo.contentType !== 'vod' ||
            contentInfo.contentXtreamId !== getVodNumericId(item)
        ) {
            return null;
        }

        return session;
    });

    readonly externalPrimaryLabel = computed(() => {
        const session = this.matchedExternalPlayback();
        if (!session) {
            return null;
        }

        const player = session.player.toUpperCase();
        switch (session.status) {
            case 'launching':
                return `Opening in ${player}...`;
            case 'opened':
            case 'playing':
                return `Stop ${player}`;
            default:
                return null;
        }
    });

    readonly externalPrimaryIcon = computed(() => {
        const session = this.matchedExternalPlayback();
        switch (session?.status) {
            case 'launching':
                return 'hourglass_top';
            case 'opened':
            case 'playing':
                return 'stop_circle';
            default:
                return 'play_arrow';
        }
    });

    readonly isExternalLaunchPending = computed(
        () => this.matchedExternalPlayback()?.status === 'launching'
    );

    readonly isExternalStopAction = computed(() => {
        const status = this.matchedExternalPlayback()?.status;
        return status === 'opened' || status === 'playing';
    });

    readonly externalPrimaryButtonState = computed(() => {
        if (this.isExternalLaunchPending()) {
            return 'launching';
        }

        return this.isExternalStopAction() ? 'stop' : 'idle';
    });

    onPlay(): void {
        this.playClicked.emit(this.item());
    }

    onPrimaryAction(): void {
        if (this.isExternalStopAction()) {
            void this.stopExternalPlayback();
            return;
        }

        if (this.hasPlaybackPosition()) {
            this.onResume();
            return;
        }

        this.onPlay();
    }

    onResume(): void {
        const pos = this.effectivePlaybackPosition();
        if (pos && pos > 0) {
            this.resumeClicked.emit({
                item: this.item(),
                positionSeconds: pos,
            });
        }
    }

    toggleFavorite(): void {
        this.favoriteToggled.emit({
            item: this.item(),
            isFavorite: !this.isFavorite(),
        });
    }

    openActor(member: TmdbEnrichedCastMember): void {
        if (!member.tmdbPersonId) {
            return;
        }
        const item = this.item();
        const basePath =
            item.type === 'stalker' ? '/workspace/stalker' : '/workspace/xtreams';
        void this.router.navigate([
            basePath,
            item.playlistId,
            'actor',
            member.tmdbPersonId,
        ]);
    }

    goBack(): void {
        this.backClicked.emit();
    }

    onDownload(): void {
        if (this.isDemoAccount()) return;
        this.downloadRequested.emit(this.item());
    }

    onInlineTimeUpdate(event: {
        currentTime: number;
        duration: number;
    }): void {
        this.inlineTimeUpdated.emit(event);
    }

    closeInlinePlayback(): void {
        this.inlinePlaybackClosed.emit();
    }

    onStreamUrlCopied(): void {
        this.streamUrlCopied.emit();
    }

    onInlineExternalFallbackRequested(
        request: PlaybackFallbackRequest
    ): void {
        this.inlineExternalFallbackRequested.emit(request);
    }

    async stopExternalPlayback(): Promise<void> {
        await this.externalPlaybackActions.closeSession(
            this.matchedExternalPlayback()
        );
    }

    async playFromLocal(): Promise<void> {
        if (this.isDemoAccount()) return;
        const item = this.item();
        const vodId = getVodNumericId(item);

        const filePath = this.downloadsService.getDownloadedFilePath(
            vodId,
            item.playlistId,
            'vod'
        );

        if (filePath) {
            await this.downloadsService.playDownload(filePath);
        }
    }
}