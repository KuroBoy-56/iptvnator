import { SyncUserCredentials } from './panel-sync.types';

export interface SeriesInfoSummary {
    name: string;
    cover: string;
}

const cache = new Map<string, Promise<SeriesInfoSummary | null>>();

/**
 * Series name and cover from the provider (get_series_info). The panel keys
 * series progress by series name, so episodes need it when saving.
 */
export function lookupSeriesInfo(
    creds: SyncUserCredentials,
    seriesId: string,
    fetchFn: typeof fetch = (...args) => fetch(...args)
): Promise<SeriesInfoSummary | null> {
    const server = creds.server?.trim().replace(/\/+$/, '');
    if (!server || !creds.username || !creds.password || !seriesId) {
        return Promise.resolve(null);
    }
    const key = `${server}|${creds.username}|${seriesId}`;
    const known = cache.get(key);
    if (known) return known;

    const url =
        `${server}/player_api.php?username=${encodeURIComponent(creds.username)}` +
        `&password=${encodeURIComponent(creds.password)}` +
        `&action=get_series_info&series_id=${encodeURIComponent(seriesId)}`;
    const request = fetchFn(url)
        .then((res) => (res.ok ? res.json() : null))
        .then((body) => {
            const info = body?.info;
            if (!info?.name) return null;
            const cover = info.cover || (Array.isArray(info.backdrop_path) ? info.backdrop_path[0] : '') || '';
            return { name: String(info.name), cover: String(cover) };
        })
        .catch(() => null);
    cache.set(key, request);
    return request;
}
