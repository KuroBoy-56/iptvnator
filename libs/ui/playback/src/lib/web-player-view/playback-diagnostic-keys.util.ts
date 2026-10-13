import {
    type PlaybackDiagnostic,
    PlaybackDiagnosticCode,
} from '../playback-diagnostics/playback-diagnostics.util';

/** i18n key prefix of a playback diagnostic (`<base>.TITLE` / `.DESCRIPTION`). */
export function getDiagnosticTranslationBase(
    issue: PlaybackDiagnostic
): string {
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
