import { VideoPlayer } from '@iptvnator/shared/interfaces';

/**
 * MPX Player: MPV is the default player of the desktop app (Windows, macOS and Linux). Movies and series open in MPV;
 * live channels still play inline unless Settings › "Canales en vivo también con MPV/VLC" is on. The PWA cannot start
 * MPV, so it keeps the built-in Video.js player.
 */
export function defaultVideoPlayer(): VideoPlayer {
    return typeof window !== 'undefined' && !!window.electron
        ? VideoPlayer.MPV
        : VideoPlayer.VideoJs;
}

/** localStorage flag: the one-time switch of the old Video.js default to MPV already ran. */
export const PLAYER_MPV_MIGRATED_KEY = 'mpx:player-mpv-v1';

function readPlayerMigrated(): boolean {
    try {
        return localStorage.getItem(PLAYER_MPV_MIGRATED_KEY) === '1';
    } catch {
        return true; // no storage: never flip a saved choice
    }
}

export function markPlayerMigrated(): void {
    try {
        localStorage.setItem(PLAYER_MPV_MIGRATED_KEY, '1');
    } catch {
        // storage blocked
    }
}

/**
 * Saved settings from before MPV was the default hold Video.js (the old default, written with every settings save).
 * In the desktop app they move to MPV once; a player chosen after that (Video.js included) is kept.
 */
export function migrateDefaultPlayer(
    stored: VideoPlayer | undefined
): VideoPlayer | undefined {
    if (readPlayerMigrated()) return stored;
    if (
        (stored === undefined || stored === VideoPlayer.VideoJs) &&
        defaultVideoPlayer() === VideoPlayer.MPV
    ) {
        return VideoPlayer.MPV;
    }
    return stored;
}
