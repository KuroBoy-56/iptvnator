import { Injectable, inject, signal } from '@angular/core';
import { RuntimeCapabilitiesService } from '@iptvnator/services';
import {
    otherSchemeUrl,
    rememberStreamScheme,
} from '@iptvnator/shared/interfaces';
import type { PlaybackDiagnostic } from '../playback-diagnostics/playback-diagnostics.util';

/**
 * True when an inline (Video.js / HTML5 / ArtPlayer) failure means the
 * browser engine cannot handle the stream itself — unsupported container or
 * codec (MKV, AVI, AC-3/DTS/TrueHD audio, HEVC 10-bit/HDR...), a decode
 * failure, browser-only access rules (CORS, mixed content) or HLS key/DRM
 * handling — so a native player would do better. Network failures and
 * unknown errors keep the inline diagnostic: MPV would fail the same way.
 */
export function shouldAutoSwitchToEmbeddedMpv(
    issue: PlaybackDiagnostic | null | undefined
): boolean {
    return !!issue?.externalFallbackRecommended;
}

/**
 * Answers "can this machine play through the embedded MPV player right
 * now?" for the automatic inline → embedded MPV fallback.
 *
 * The bridge method alone is not enough: packaged builds expose
 * `prepareEmbeddedMpv` even when the native addon or the bundled libmpv
 * runtime is missing, and then report `supported: false`. The answer is
 * cached for the app run (the addon/runtime do not appear or vanish while
 * the app is open); a failed IPC call is not cached so a later playback can
 * ask again.
 */
@Injectable({ providedIn: 'root' })
export class EmbeddedMpvAvailabilityService {
    private readonly runtime = inject(RuntimeCapabilitiesService);
    private cached: boolean | null = null;
    private pending: Promise<boolean> | null = null;

    isAvailable(): Promise<boolean> {
        if (!this.runtime.supportsEmbeddedMpv) {
            return Promise.resolve(false);
        }
        if (this.cached !== null) {
            return Promise.resolve(this.cached);
        }

        this.pending ??= this.probe().finally(() => {
            this.pending = null;
        });
        return this.pending;
    }

    private async probe(): Promise<boolean> {
        try {
            const support = await window.electron?.prepareEmbeddedMpv?.();
            this.cached = support?.supported === true;
            return this.cached;
        } catch (error) {
            console.warn('[EmbeddedMpv] Availability check failed.', error);
            return false;
        }
    }
}

/** What the player should do after an inline failure. */
export type InlineFailureRecovery = 'retry-other-scheme' | 'embedded-mpv' | 'none';

/**
 * Per-player recovery state for the current stream (Smarters-like):
 * 1. the first failure retries the same URL once on the other scheme
 *    (http ↔ https, `otherSchemeUrl`); a scheme that then plays is
 *    remembered for the host for the rest of the session;
 * 2. a format/codec failure (`shouldAutoSwitchToEmbeddedMpv`) hands the
 *    stream to embedded MPV when it is available — `active` overrides the
 *    selected player for this stream only, the saved settings are never
 *    written.
 * `reset()` runs whenever the stream changes.
 */
export class PlaybackRecovery {
    /** Embedded MPV took over the current stream. */
    readonly active = signal(false);
    /** The availability check for a switch is in flight. */
    readonly pending = signal(false);
    /** Resume position handed to embedded MPV (null = playback start time). */
    readonly startTime = signal<number | null>(null);
    /** Other-scheme URL being tried for the current stream (null = original). */
    readonly schemeUrl = signal<string | null>(null);
    private lastInlinePosition = 0;
    private generation = 0;
    private schemeTried = false;
    private schemeRemembered = false;
    /** URL that already played: its scheme works, no scheme retry for it. */
    private playedUrl: string | null = null;
    private issueBeforeSchemeRetry: PlaybackDiagnostic | null = null;
    private revertSchemeOnSwitch = false;

    constructor(private readonly availability: EmbeddedMpvAvailabilityService) {}

    recordInlinePosition(currentTime: number): void {
        if (Number.isFinite(currentTime)) {
            this.lastInlinePosition = currentTime;
        }
    }

    /** Playback advanced on `url`: remember the scheme if it was the retry. */
    notePlaying(url: string, currentTime: number): void {
        if (!(currentTime > 0)) {
            return;
        }
        this.playedUrl = url;
        if (
            !this.schemeRemembered &&
            this.schemeUrl() !== null &&
            url === this.schemeUrl()
        ) {
            this.schemeRemembered = true;
            rememberStreamScheme(url);
        }
    }

    /** Decides the next step after an inline player failure on `url`. */
    onInlineFailure(
        issue: PlaybackDiagnostic,
        url: string
    ): InlineFailureRecovery {
        if (this.tryOtherScheme(url)) {
            this.issueBeforeSchemeRetry = issue;
            return 'retry-other-scheme';
        }
        if (shouldAutoSwitchToEmbeddedMpv(issue)) {
            return 'embedded-mpv';
        }
        // The other scheme did not answer at all, but the original URL had a
        // format problem: MPV gets the original URL.
        if (
            this.schemeUrl() !== null &&
            shouldAutoSwitchToEmbeddedMpv(this.issueBeforeSchemeRetry)
        ) {
            this.revertSchemeOnSwitch = true;
            return 'embedded-mpv';
        }
        return 'none';
    }

    /** Embedded MPV could not open `url`: retry it once on the other scheme. */
    onEmbeddedMpvFailure(url: string): boolean {
        return this.tryOtherScheme(url);
    }

    /**
     * Switches to embedded MPV when it is available and the inline failure is
     * still current (`stillFailing`) once the check resolves. Resolves to
     * whether the switch happened.
     */
    async trySwitch(
        isLive: boolean,
        stillFailing: () => boolean
    ): Promise<boolean> {
        if (this.active() || this.pending()) {
            return false;
        }
        const generation = this.generation;
        this.pending.set(true);
        const available = await this.availability.isAvailable();
        if (generation !== this.generation) {
            return false;
        }
        this.pending.set(false);
        if (!available || !stillFailing()) {
            return false;
        }

        this.startTime.set(
            !isLive && this.lastInlinePosition > 1
                ? this.lastInlinePosition
                : null
        );
        if (this.revertSchemeOnSwitch) {
            this.schemeUrl.set(null);
        }
        this.active.set(true);
        return true;
    }

    reset(): void {
        this.generation += 1;
        this.lastInlinePosition = 0;
        this.schemeTried = false;
        this.schemeRemembered = false;
        this.playedUrl = null;
        this.issueBeforeSchemeRetry = null;
        this.revertSchemeOnSwitch = false;
        this.pending.set(false);
        this.startTime.set(null);
        this.schemeUrl.set(null);
        this.active.set(false);
    }

    private tryOtherScheme(url: string): boolean {
        if (this.schemeTried || url === this.playedUrl) {
            return false;
        }
        this.schemeTried = true;
        const other = otherSchemeUrl(url);
        if (!other) {
            return false;
        }
        this.schemeUrl.set(other);
        return true;
    }
}
