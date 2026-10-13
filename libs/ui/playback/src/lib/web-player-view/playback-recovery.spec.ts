import { TestBed } from '@angular/core/testing';
import { RuntimeCapabilitiesService } from '@iptvnator/services';
import {
    applyPreferredStreamScheme,
    resetStreamSchemePreference,
} from '@iptvnator/shared/interfaces';
import {
    PlaybackRecovery,
    EmbeddedMpvAvailabilityService,
    shouldAutoSwitchToEmbeddedMpv,
} from './playback-recovery';
import {
    PlaybackDiagnostic,
    PlaybackDiagnosticCode,
    PlaybackDiagnosticSource,
} from '../playback-diagnostics/playback-diagnostics.util';

type ElectronWindow = { electron?: unknown };

describe('EmbeddedMpvAvailabilityService', () => {
    let runtime: { supportsEmbeddedMpv: boolean };
    let prepareEmbeddedMpv: jest.Mock;
    let service: EmbeddedMpvAvailabilityService;

    beforeEach(() => {
        runtime = { supportsEmbeddedMpv: true };
        prepareEmbeddedMpv = jest.fn();
        (window as unknown as ElectronWindow).electron = { prepareEmbeddedMpv };
        TestBed.configureTestingModule({
            providers: [
                { provide: RuntimeCapabilitiesService, useValue: runtime },
            ],
        });
        service = TestBed.inject(EmbeddedMpvAvailabilityService);
    });

    afterEach(() => {
        delete (window as unknown as ElectronWindow).electron;
    });

    it('is unavailable without the embedded MPV bridge (PWA / old builds)', async () => {
        runtime.supportsEmbeddedMpv = false;

        await expect(service.isAvailable()).resolves.toBe(false);
        expect(prepareEmbeddedMpv).not.toHaveBeenCalled();
    });

    it('is available when the addon and runtime load, and asks only once', async () => {
        prepareEmbeddedMpv.mockResolvedValue({
            supported: true,
            platform: 'darwin',
        });

        await expect(service.isAvailable()).resolves.toBe(true);
        await expect(service.isAvailable()).resolves.toBe(true);
        expect(prepareEmbeddedMpv).toHaveBeenCalledTimes(1);
    });

    it('is unavailable when the packaged build has no addon or runtime', async () => {
        prepareEmbeddedMpv.mockResolvedValue({
            supported: false,
            platform: 'win32',
            reason: 'Unable to locate the embedded MPV native addon.',
        });

        await expect(service.isAvailable()).resolves.toBe(false);
        await expect(service.isAvailable()).resolves.toBe(false);
        expect(prepareEmbeddedMpv).toHaveBeenCalledTimes(1);
    });

    it('does not cache a failed IPC call', async () => {
        jest.spyOn(console, 'warn').mockImplementation(() => undefined);
        prepareEmbeddedMpv
            .mockRejectedValueOnce(new Error('ipc closed'))
            .mockResolvedValueOnce({ supported: true, platform: 'win32' });

        await expect(service.isAvailable()).resolves.toBe(false);
        await expect(service.isAvailable()).resolves.toBe(true);
        expect(prepareEmbeddedMpv).toHaveBeenCalledTimes(2);
    });
});

describe('PlaybackRecovery', () => {
    afterEach(() => resetStreamSchemePreference());

    it('retries the other scheme once, then goes to embedded MPV for format failures', () => {
        const recovery = createFallback(true);
        const url = 'http://line.test:80/movie/u/p/1.mkv';

        expect(recovery.onInlineFailure(createIssue(true), url)).toBe(
            'retry-other-scheme'
        );
        expect(recovery.schemeUrl()).toBe('https://line.test/movie/u/p/1.mkv');
        expect(
            recovery.onInlineFailure(createIssue(true), recovery.schemeUrl()!)
        ).toBe('embedded-mpv');
        expect(recovery.onEmbeddedMpvFailure(url)).toBe(false);
    });

    it('keeps the diagnostic when both schemes fail to answer', () => {
        const recovery = createFallback(true);
        const url = 'https://line.test/live/u/p/2.ts';

        recovery.onInlineFailure(createIssue(false), url);
        expect(
            recovery.onInlineFailure(createIssue(false), recovery.schemeUrl()!)
        ).toBe('none');
    });

    it('sends MPV back to the original URL when only the other scheme is dead', async () => {
        const recovery = createFallback(true);
        recovery.onInlineFailure(createIssue(true), 'https://line.test/a.mkv');
        expect(
            recovery.onInlineFailure(createIssue(false), 'http://line.test/a.mkv')
        ).toBe('embedded-mpv');

        await recovery.trySwitch(false, () => true);
        expect(recovery.schemeUrl()).toBeNull();
        expect(recovery.active()).toBe(true);
    });

    it('remembers the retried scheme once it plays, and skips the retry for a URL that played', () => {
        const recovery = createFallback(true);
        recovery.onInlineFailure(createIssue(false), 'https://line.test/a.ts');
        recovery.notePlaying('http://line.test/a.ts', 0);
        expect(applyPreferredStreamScheme('https://line.test/b.ts')).toBe(
            'https://line.test/b.ts'
        );
        recovery.notePlaying('http://line.test/a.ts', 2);
        expect(applyPreferredStreamScheme('https://line.test/b.ts')).toBe(
            'http://line.test/b.ts'
        );

        recovery.reset();
        recovery.notePlaying('http://line.test/c.ts', 5);
        expect(
            recovery.onInlineFailure(createIssue(true), 'http://line.test/c.ts')
        ).toBe('embedded-mpv');
    });

    it('only reacts to failures a native player handles better', () => {
        expect(shouldAutoSwitchToEmbeddedMpv(createIssue(true))).toBe(true);
        expect(shouldAutoSwitchToEmbeddedMpv(createIssue(false))).toBe(false);
        expect(shouldAutoSwitchToEmbeddedMpv(null)).toBe(false);
    });

    it('switches with the last inline position for VOD and the live edge for live', async () => {
        const fallback = createFallback(true);
        fallback.recordInlinePosition(95.5);

        await expect(fallback.trySwitch(false, () => true)).resolves.toBe(
            true
        );
        expect(fallback.active()).toBe(true);
        expect(fallback.startTime()).toBe(95.5);

        fallback.reset();
        fallback.recordInlinePosition(30);
        await fallback.trySwitch(true, () => true);
        expect(fallback.startTime()).toBeNull();
    });

    it('does not switch when MPV is unavailable or the inline player recovered', async () => {
        const unavailable = createFallback(false);
        await expect(unavailable.trySwitch(false, () => true)).resolves.toBe(
            false
        );
        expect(unavailable.active()).toBe(false);
        expect(unavailable.pending()).toBe(false);

        const recovered = createFallback(true);
        await expect(recovered.trySwitch(false, () => false)).resolves.toBe(
            false
        );
        expect(recovered.active()).toBe(false);
    });

    it('ignores a late availability answer after the stream changed', async () => {
        let resolveAvailability: (available: boolean) => void = () =>
            undefined;
        const fallback = new PlaybackRecovery({
            isAvailable: () =>
                new Promise<boolean>((resolve) => {
                    resolveAvailability = resolve;
                }),
        } as EmbeddedMpvAvailabilityService);

        const switching = fallback.trySwitch(false, () => true);
        expect(fallback.pending()).toBe(true);
        fallback.reset();
        resolveAvailability(true);

        await expect(switching).resolves.toBe(false);
        expect(fallback.active()).toBe(false);
        expect(fallback.pending()).toBe(false);
    });
});

function createFallback(available: boolean): PlaybackRecovery {
    return new PlaybackRecovery({
        isAvailable: () => Promise.resolve(available),
    } as EmbeddedMpvAvailabilityService);
}

function createIssue(externalFallbackRecommended: boolean): PlaybackDiagnostic {
    return {
        code: externalFallbackRecommended
            ? PlaybackDiagnosticCode.UnsupportedCodec
            : PlaybackDiagnosticCode.NetworkError,
        source: PlaybackDiagnosticSource.Native,
        sourceUrl: 'https://example.com/movie.mkv',
        container: 'mkv',
        audioCodecs: [],
        videoCodecs: [],
        externalFallbackRecommended,
    };
}
