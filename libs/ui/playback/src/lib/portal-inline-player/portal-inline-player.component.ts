import { ClipboardModule } from '@angular/cdk/clipboard';
import {
    ChangeDetectionStrategy,
    Component,
    computed,
    input,
    output,
    inject,
    effect,
    signal
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { TranslateModule } from '@ngx-translate/core';
import {
    PlayerContentInfo,
    ResolvedPortalPlayback
} from '@iptvnator/shared/interfaces';
import type { PlaybackFallbackRequest } from '../playback-diagnostics/playback-diagnostics.util';
import { WebPlayerViewComponent } from '../web-player-view/web-player-view.component';
import type {
    SeriesEpisodeMetadata,
    SeriesPlaybackNavigation,
} from './series-playback-navigation';
import { SettingsStore } from '@iptvnator/services';
import { PORTAL_EXTERNAL_PLAYBACK, PORTAL_PLAYER } from '@iptvnator/portal/shared/util';

@Component({
    selector: 'app-portal-inline-player',
    templateUrl: './portal-inline-player.component.html',
    styleUrl: './portal-inline-player.component.scss',
    imports: [
        ClipboardModule,
        MatButtonModule,
        MatIconModule,
        MatTooltipModule,
        TranslateModule,
        WebPlayerViewComponent,
    ],
    changeDetection: ChangeDetectionStrategy.OnPush,
    host: {
        class: 'portal-inline-player',
        '[attr.data-has-player]': 'hasPlayback()',
    },
})
export class PortalInlinePlayerComponent {
    readonly playback = input<ResolvedPortalPlayback | null>(null);
    readonly episodeMetadata = input<SeriesEpisodeMetadata | null>(null);
    readonly seriesNavigation = input<SeriesPlaybackNavigation | null>(null);
    readonly title = computed(() => this.playback()?.title ?? '');
    readonly streamUrl = computed(() => this.playback()?.streamUrl ?? '');
    readonly startTime = computed(() => this.playback()?.startTime ?? 0);
    readonly contentInfo = computed<PlayerContentInfo | undefined>(
        () => this.playback()?.contentInfo
    );
    readonly hasPlayback = computed(() => !!this.playback()?.streamUrl);
    readonly episodeMetadataText = computed(() => {
        const metadata = this.episodeMetadata();
        if (!metadata) return '';
        return metadata.title ? `${metadata.label} - ${metadata.title}` : metadata.label;
    });

    readonly closed = output<void>();
    readonly backClicked = output<void>();
    readonly timeUpdate = output<{ currentTime: number; duration: number; }>();
    readonly streamUrlCopied = output<void>();
    readonly externalFallbackRequested = output<PlaybackFallbackRequest>();
    readonly playbackEnded = output<void>();
    readonly previousEpisodeRequested = output<void>();
    readonly nextEpisodeRequested = output<void>();

    /** Last time update of the inline player (seconds); the stream whose next-episode card was dismissed. */
    private readonly progress = signal({ currentTime: 0, duration: 0 });
    private readonly nextDismissedFor = signal('');
    /** "Leave the video?" asked from the back arrow or the close button. */
    readonly askExit = signal<'back' | 'close' | null>(null);
    /**
     * Netflix-style next episode (same as the TV and phone apps): seconds left during the last 15 s, 0 = no card.
     * "Watch now" plays it; "Cancel" lets the end play and the series autoplay (playbackEnded) moves on.
     */
    readonly nextSeconds = computed(() => {
        const { currentTime, duration } = this.progress();
        const left = duration - currentTime;
        if (!this.seriesNavigation()?.canNext || this.nextDismissedFor() === this.streamUrl()) return 0;
        if (duration <= 120 || currentTime <= 60 || left <= 0 || left > 15) return 0;
        return Math.ceil(left);
    });

    private readonly settingsStore = inject(SettingsStore);
    private readonly externalPlayback = inject(PORTAL_EXTERNAL_PLAYBACK);
    private readonly portalPlayer = inject(PORTAL_PLAYER);

    // Atrapa a MPV limpiamente
    readonly isMpvActive = computed(() => {
        if (!this.hasPlayback()) return false;
        const player = String(this.settingsStore.player() ?? '').toLowerCase();
        return player.includes('mpv') || player === '3';
    });
    
    private isLaunched = false;

    constructor() {
        // a new video starts its own count
        effect(() => {
            this.streamUrl();
            this.progress.set({ currentTime: 0, duration: 0 });
        });

        // Lanza MPV
        effect(() => {
            const pb = this.playback();
            const mpvActive = this.isMpvActive();

            if (mpvActive && pb && !this.isLaunched) {
                this.isLaunched = true;
                this.portalPlayer.openExternalPlayback(pb, 'mpv' as any);
            }
        });

        // Cierra la pantalla si MPV se cierra
        effect(() => {
            const session = this.externalPlayback.activeSession();
            if (this.isMpvActive() && this.isLaunched) {
                if (!session || session.status === 'closed' || session.status === 'error') {
                    this.isLaunched = false;
                    this.onClose();
                }
            }
        });
    }

    closeMpv() {
        const session = this.externalPlayback.activeSession();
        if (session && session.status !== 'closed' && session.status !== 'error') {
            this.externalPlayback.closeSession(session);
        }
        this.isLaunched = false;
        this.onClose();
    }

    onClose(): void { this.closed.emit(); }
    onBack(): void { this.backClicked.emit(); }
    onTimeUpdate(event: { currentTime: number; duration: number }): void {
        this.progress.set(event);
        this.timeUpdate.emit(event);
    }
    onCopied(): void { this.streamUrlCopied.emit(); }
    onExternalFallbackRequested(request: PlaybackFallbackRequest): void { this.externalFallbackRequested.emit(request); }
    onPlaybackEnded(): void {
        const { currentTime, duration } = this.progress();
        // a stream cut long before its end is not the end of the episode: no jump to the next one
        if (duration > 0 && currentTime < duration - 90 && currentTime < duration * 0.9) return;
        this.playbackEnded.emit();
    }
    dismissNext(): void { this.nextDismissedFor.set(this.streamUrl()); }
    confirmExit(): void {
        const how = this.askExit();
        this.askExit.set(null);
        if (how === 'back') this.onBack();
        else if (how === 'close') this.onClose();
    }
    onPreviousEpisodeRequested(): void { this.previousEpisodeRequested.emit(); }
    onNextEpisodeRequested(): void { this.nextEpisodeRequested.emit(); }
}