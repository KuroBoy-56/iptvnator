import type { ResolvedPortalPlayback } from '@iptvnator/shared/interfaces';

/** Case-insensitive lookup of a playback request header. */
export function getHeaderValue(
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
