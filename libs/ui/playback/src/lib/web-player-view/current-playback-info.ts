import { Channel, ResolvedPortalPlayback } from '@iptvnator/shared/interfaces';

export interface CurrentPlaybackInfo {
    userId: { username: string; password: string; server: string };
    title: string;
    url: string;
    poster: string;
    type: 'live' | 'movie' | 'series';
    id: string;
    categoryId: string;
    episodeName: string;
    season: string;
}

function storageValue(key: string, fallback = ''): string {
    try {
        return localStorage.getItem(key) || fallback;
    } catch {
        return fallback;
    }
}

/**
 * What the built-in players report to the panel sync while playing
 * (`window.currentPlaybackInfo`): the item, its type and the session line.
 */
export function buildCurrentPlaybackInfo(
    channel: Channel | undefined,
    playback: ResolvedPortalPlayback,
    hasSeriesNavigation: boolean
): CurrentPlaybackInfo {
    const raw = (channel ?? {}) as Channel & {
        stream_id?: string | number;
        series_id?: string | number;
        category_id?: string | number;
    };
    let type: CurrentPlaybackInfo['type'] = 'live';
    let id = String(channel?.id || '');
    let episodeName = '';
    if (raw.stream_id) {
        type = 'movie';
        id = String(raw.stream_id);
    } else if (raw.series_id) {
        type = 'series';
        id = String(raw.series_id);
        if (hasSeriesNavigation) episodeName = playback.title || '';
    }
    return {
        userId: {
            username: storageValue('session_user', 'default_user'),
            password: storageValue('session_pass'),
            server: storageValue('session_server'),
        },
        title: playback.title,
        url: playback.streamUrl,
        poster: channel?.tvg?.logo || '',
        type,
        id,
        categoryId: String(raw.category_id || ''),
        episodeName,
        season: '',
    };
}
