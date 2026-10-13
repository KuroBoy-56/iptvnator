import type { HlsConfig } from 'hls.js';

/**
 * hls.js settings for the HTML5 and ArtPlayer inline players (VOD and live)
 * so 4K / high-bitrate HLS is never capped:
 * - `capLevelToPlayerSize: false`: ABR may pick the 2160p rendition even
 *   when the window is smaller than 4K (pinned so it cannot regress).
 * - `maxBufferSize` 120 MB: the hls.js default (60 MB) holds only ~20 s of a
 *   25 Mbit/s 4K stream, so the size cap kicked in before `maxBufferLength`.
 * - `maxMaxBufferLength` 120 s keeps the forward buffer bounded in memory.
 */
export const HIGH_QUALITY_HLS_CONFIG: Partial<HlsConfig> = {
    capLevelToPlayerSize: false,
    maxBufferLength: 30,
    maxMaxBufferLength: 120,
    maxBufferSize: 120 * 1000 * 1000,
};

/**
 * Video.js VHS options: VHS limits renditions to the player's on-screen
 * size by default (`limitRenditionByPlayerDimensions: true`), which plays
 * 1080p or less for a 4K source in a normal window. Turn that off so the
 * best rendition the bandwidth allows is used.
 */
export const HIGH_QUALITY_VHS_OPTIONS = {
    limitRenditionByPlayerDimensions: false,
} as const;
