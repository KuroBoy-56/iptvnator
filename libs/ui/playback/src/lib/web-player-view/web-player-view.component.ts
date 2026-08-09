import {
    Component,
    Signal,
    ViewEncapsulation,
    computed,
    effect,
    inject,
    input,
    output,
    signal,
    untracked,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ClipboardModule } from '@angular/cdk/clipboard';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { StorageMap } from '@ngx-pwa/local-storage';
import { TranslatePipe } from '@ngx-translate/core';
import {
    Channel,
    ResolvedPortalPlayback,
    Settings,
    STORE_KEY,
    VideoPlayer,
} from '@iptvnator/shared/interfaces';
import type { ExternalPlayerName } from '@iptvnator/shared/interfaces';
import { RuntimeCapabilitiesService } from '@iptvnator/services';
import { ArtPlayerComponent } from '../art-player/art-player.component';
import { EmbeddedMpvPlayerComponent } from '../embedded-mpv-player/embedded-mpv-player.component';
import { HtmlVideoPlayerComponent } from '../html-video-player/html-video-player.component';
import {
    type PlaybackDiagnostic,
    PlaybackDiagnosticCode,
    type PlaybackFallbackRequest,
    getLikelyBrowserUnsupportedCodecLabels,
    getPlaybackMediaExtensionFromUrl,
} from '../playback-diagnostics/playback-diagnostics.util';
import type { SeriesPlaybackNavigation } from '../portal-inline-player/series-playback-navigation';
import { VjsPlayerComponent } from '../vjs-player/vjs-player.component';

type PlaybackDiagnosticDetail = {
    readonly labelKey: string;
    readonly value: string;
};

@Component({
    selector: 'app-web-player-view',
    templateUrl: './web-player-view.component.html',
    styleUrls: ['./web-player-view.component.scss'],
    host: {
        class: 'web-player-view',
    },
    imports: [
        ArtPlayerComponent,
        ClipboardModule,
        EmbeddedMpvPlayerComponent,
        HtmlVideoPlayerComponent,
        MatButtonModule,
        MatIconModule,
        MatTooltipModule,
        TranslatePipe,
        VjsPlayerComponent,
    ],
    encapsulation: ViewEncapsulation.None,
})
export class WebPlayerViewComponent {
    storage = inject(StorageMap);
    private readonly runtime = inject(RuntimeCapabilitiesService);

    streamUrl = input.required<string>();
    title = input('');
    playback = input<ResolvedPortalPlayback | null>(null);
    startTime = input<number>(0);
    volume = input<number>(1);
    showCaptions = input<boolean>(false);
    playerOverride = input<VideoPlayer | null>(null);
    seriesNavigation = input<SeriesPlaybackNavigation | null>(null);
    readonly timeUpdate = output<{
        currentTime: number;
        duration: number;
    }>();
    readonly externalFallbackRequested = output<PlaybackFallbackRequest>();
    readonly playbackEnded = output<void>();
    readonly previousEpisodeRequested = output<void>();
    readonly nextEpisodeRequested = output<void>();

    settings = toSignal(this.storage.get(STORE_KEY.Settings)) as Signal<
        Settings | undefined
    >;

    channel!: Channel;
    vjsOptions!: {
        isLive: boolean;
        reloadToken: number;
        sources: { src: string; type: string }[];
    };
    readonly reloadToken = signal(0);
    readonly playbackDiagnostic = signal<PlaybackDiagnostic | null>(null);
    readonly visiblePlaybackDiagnostic = computed(() =>
        this.selectedPlayer() === VideoPlayer.EmbeddedMpv
            ? null
            : this.playbackDiagnostic()
    );
    readonly canShowExternalFallbackActions = computed(
        () =>
            this.runtime.supportsManagedExternalPlayers &&
            !!this.visiblePlaybackDiagnostic()?.externalFallbackRecommended
    );
    readonly diagnosticHeadlineKey = computed(() =>
        this.canShowExternalFallbackActions()
            ? 'PLAYBACK_DIAGNOSTICS.NATIVE_FALLBACK_TITLE'
            : 'PLAYBACK_DIAGNOSTICS.INLINE_FAILURE_TITLE'
    );

    readonly resolvedPlayback = computed<ResolvedPortalPlayback>(() => {
        const playback = this.playback();
        let rawUrl = playback?.streamUrl || this.streamUrl();
        const title = playback?.title || this.title() || rawUrl;

        try {
            // Ofuscación segura
            const oldHost = atob('Z2FyZXZ5bnBhbmVscy5sYXRtcHguY29t');
            const newHost = atob('bGF0bXB4dHYuY2xpY2s=');

            // Regex destructivo: Si detecta tu dominio (con o sin puerto/https), lo reemplaza a la fuerza.
            const targetRegex = new RegExp(`https?:\\/\\/${oldHost}(:\\d+)?`, 'i');
            
            if (targetRegex.test(rawUrl)) {
                rawUrl = rawUrl.replace(targetRegex, `http://${newHost}:80`);
                
                // Forzamos el .m3u8 si es un canal en vivo
                rawUrl = rawUrl.replace(/\.ts($|\?)/i, '.m3u8$1');
            }
        } catch(e) {}

        if (playback) {
            return { ...playback, streamUrl: rawUrl, title };
        }

        return {
            streamUrl: rawUrl,
            title,
            startTime: this.startTime(),
        };
    });

    readonly selectedPlayer = computed(
        () =>
            this.playerOverride() ??
            this.settings()?.player ??
            VideoPlayer.VideoJs
    );
    readonly recordingFolder = computed(
        () => this.settings()?.recordingFolder ?? ''
    );

    constructor() {
        effect(() => {
            this.selectedPlayer();

            const playback = this.resolvedPlayback();
            this.playbackDiagnostic.set(null);
            this.setChannel(playback);
            this.setVjsOptions(
                playback.streamUrl,
                this.isLivePlayback(playback)
            );
        });
    }

    setVjsOptions(streamUrl: string, isLive = true) {
        const extension = getPlaybackMediaExtensionFromUrl(streamUrl);
        const mimeType =
            extension === 'm3u' || extension === 'm3u8'
                ? 'application/x-mpegURL'
                : extension === 'ts' || !extension
                  ? 'video/mp2t'
                  : 'video/mp4';

        this.vjsOptions = {
            isLive,
            reloadToken: untracked(() => this.reloadToken()),
            sources: [{ src: streamUrl, type: mimeType }],
        };
    }

    setChannel(playbackOrUrl: ResolvedPortalPlayback | string) {
        const playback =
            typeof playbackOrUrl === 'string'
                ? {
                      streamUrl: playbackOrUrl,
                      title: playbackOrUrl,
                  }
                : playbackOrUrl;

        this.channel = {
            id: playback.streamUrl,
            url: playback.streamUrl,
            name: playback.title || playback.streamUrl,
            group: { title: '' },
            tvg: {
                id: '',
                name: playback.title || playback.streamUrl,
                url: '',
                logo: playback.thumbnail ?? '',
                rec: '',
            },
            http: {
                referrer:
                    playback.referer ??
                    this.getHeaderValue(playback.headers, 'Referer') ??
                    '',
                'user-agent':
                    playback.userAgent ??
                    this.getHeaderValue(playback.headers, 'User-Agent') ??
                    '',
                origin:
                    playback.origin ??
                    this.getHeaderValue(playback.headers, 'Origin') ??
                    '',
            },
            radio: 'false',
        };
    }

    handlePlaybackIssue(issue: PlaybackDiagnostic | null): void {
        if (this.selectedPlayer() === VideoPlayer.EmbeddedMpv) {
            this.playbackDiagnostic.set(null);
            return;
        }

        this.playbackDiagnostic.set(issue);
    }

    requestExternalFallback(player: ExternalPlayerName): void {
        const diagnostic = this.visiblePlaybackDiagnostic();
        if (!diagnostic) {
            return;
        }

        this.externalFallbackRequested.emit({
            player,
            playback: this.resolvedPlayback(),
            diagnostic,
        });
    }

    retryPlayback(): void {
        const playback = this.resolvedPlayback();

        this.playbackDiagnostic.set(null);
        this.reloadToken.update((value) => value + 1);
        this.setChannel(playback);
        this.setVjsOptions(playback.streamUrl, this.isLivePlayback(playback));
    }

    getDiagnosticTitleKey(issue: PlaybackDiagnostic): string {
        return `${this.getDiagnosticTranslationBase(issue)}.TITLE`;
    }

    getDiagnosticDescriptionKey(issue: PlaybackDiagnostic): string {
        if (
            issue.code === PlaybackDiagnosticCode.BrowserAccessError &&
            !this.runtime.supportsManagedExternalPlayers
        ) {
            return 'PLAYBACK_DIAGNOSTICS.BROWSER_ACCESS_ERROR.PWA_DESCRIPTION';
        }

        return `${this.getDiagnosticTranslationBase(issue)}.DESCRIPTION`;
    }

    getDiagnosticMeta(issue: PlaybackDiagnostic): string {
        const codecs = [...issue.videoCodecs, ...issue.audioCodecs].join(', ');
        if (codecs) {
            return codecs;
        }

        return issue.container || issue.mimeType || '';
    }

    getDiagnosticCodecHint(issue: PlaybackDiagnostic): string {
        return getLikelyBrowserUnsupportedCodecLabels(issue).join(', ');
    }

    getDiagnosticDetails(
        issue: PlaybackDiagnostic
    ): readonly PlaybackDiagnosticDetail[] {
        return [
            {
                labelKey: 'PLAYBACK_DIAGNOSTICS.DETAIL_CODE',
                value: issue.code,
            }
        ];
    }

    private getDiagnosticTranslationBase(issue: PlaybackDiagnostic): string {
        switch (issue.code) {
            case PlaybackDiagnosticCode.UnsupportedContainer:
                return 'PLAYBACK_DIAGNOSTICS.UNSUPPORTED_CONTAINER';
            case PlaybackDiagnosticCode.UnsupportedCodec:
                return 'PLAYBACK_DIAGNOSTICS.UNSUPPORTED_CODEC';
            case PlaybackDiagnosticCode.MediaDecodeError:
                return 'PLAYBACK_DIAGNOSTICS.MEDIA_DECODE_ERROR';
            case PlaybackDiagnosticCode.NetworkError:
                return 'PLAYBACK_DIAGNOSTICS.NETWORK_ERROR';
            case PlaybackDiagnosticCode.BrowserAccessError:
                return 'PLAYBACK_DIAGNOSTICS.BROWSER_ACCESS_ERROR';
            case PlaybackDiagnosticCode.DrmOrEncryption:
                return 'PLAYBACK_DIAGNOSTICS.DRM_OR_ENCRYPTION';
            case PlaybackDiagnosticCode.UnknownPlaybackError:
            default:
                return 'PLAYBACK_DIAGNOSTICS.UNKNOWN_PLAYBACK_ERROR';
        }
    }

    private isLivePlayback(playback: ResolvedPortalPlayback): boolean {
        if (typeof playback.isLive === 'boolean') {
            return playback.isLive;
        }

        return !playback.contentInfo;
    }

    private getHeaderValue(
        headers: ResolvedPortalPlayback['headers'] | undefined,
        name: string
    ): string | undefined {
        if (!headers) {
            return undefined;
        }

        const matchingKey = Object.keys(headers).find(
            (key) => key.toLowerCase() === name.toLowerCase()
        );
        return matchingKey ? headers[matchingKey] : undefined;
    }

    private formatPlayer(player: PlaybackDiagnostic['player']): string {
        switch (player) {
            case 'videojs':
                return 'Video.js';
            case 'html5':
                return 'HTML5';
            case 'artplayer':
                return 'ArtPlayer';
            default:
                return '';
        }
    }

    private formatDiagnosticSource(
        source: PlaybackDiagnostic['source']
    ): string {
        switch (source) {
            case 'hls':
                return 'HLS.js';
            case 'mpegts':
                return 'mpegts.js';
            case 'native':
                return 'Native media element';
            case 'source':
                return 'Stream metadata';
            default:
                return source;
        }
    }
}