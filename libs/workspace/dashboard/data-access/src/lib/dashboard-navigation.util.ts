import {
    PlaylistMeta,
    PortalActivityType,
    PortalAddedItem,
    PortalFavoriteItem,
    PortalRecentItem,
} from '@iptvnator/shared/interfaces';
import {
    buildStalkerDetailNavigationTarget,
    buildStalkerStateItem,
    buildXtreamNavigationTarget,
    getGlobalFavoriteNavigation,
    getRecentItemNavigation,
    WorkspaceNavigationTarget,
} from '@iptvnator/portal/shared/util';

/**
 * Pure navigation/link helpers for dashboard items.
 *
 * Extracted from `DashboardDataService` so the routing logic can be unit-tested
 * in isolation and the service stays a thin facade. None of these functions
 * touch component/service state — they map a dashboard item to a router link
 * (and optional navigation state) using the shared portal navigation builders.
 */

export type DashboardContentKind = 'all' | 'channels' | 'vod' | 'series';

function sanitizeItem<T extends { category_id?: string | number | null }>(item: T): T {
    const sanitized = { ...item };
    if (
        sanitized.category_id === undefined ||
        sanitized.category_id === null ||
        sanitized.category_id === 'null' ||
        String(sanitized.category_id).trim() === ''
    ) {
        sanitized.category_id = '0';
    }
    return sanitized;
}

export function isTypeInKind(
    type: PortalActivityType,
    kind: DashboardContentKind
): boolean {
    if (kind === 'all') {
        return true;
    }
    if (kind === 'channels') {
        return type === 'live';
    }
    if (kind === 'vod') {
        return type === 'movie';
    }
    return type === 'series';
}

export function getPlaylistLink(playlist: PlaylistMeta): string[] {
    if (playlist.serverUrl) {
        return ['/workspace', 'xtreams', playlist._id, 'vod'];
    }

    if (playlist.macAddress) {
        return ['/workspace', 'stalker', playlist._id, 'vod'];
    }

    return ['/workspace', 'playlists', playlist._id];
}

export function getRecentItemLink(item: PortalRecentItem): string[] {
    return getRecentItemNavigation(sanitizeItem(item)).link;
}

export function getRecentItemNavigationState(
    item: PortalRecentItem
): WorkspaceNavigationTarget['state'] {
    return getRecentItemNavigation(sanitizeItem(item)).state;
}

export function getGlobalFavoriteLink(item: PortalFavoriteItem): string[] {
    return getGlobalFavoriteNavigation(sanitizeItem(item)).link;
}

export function getGlobalFavoriteNavigationState(
    item: PortalFavoriteItem
): WorkspaceNavigationTarget['state'] {
    return getGlobalFavoriteNavigation(sanitizeItem(item)).state;
}

export function getRecentlyAddedLink(item: PortalAddedItem): string[] {
    const safeItem = sanitizeItem(item);
    if (safeItem.source === 'stalker' && safeItem.type !== 'live') {
        return buildStalkerDetailNavigationTarget({
            playlistId: safeItem.playlist_id,
            type: safeItem.type,
            categoryId: safeItem.category_id,
            item: buildStalkerStateItem(safeItem.stalker_item, {
                id: safeItem.id,
                title: safeItem.title,
                type: safeItem.type,
                category_id: safeItem.category_id,
                poster_url: safeItem.poster_url,
            }),
        }).link;
    }

    return buildXtreamNavigationTarget({
        playlistId: safeItem.playlist_id,
        type: safeItem.type,
        categoryId: safeItem.category_id,
        itemId: safeItem.xtream_id,
        title: safeItem.title,
        imageUrl: safeItem.poster_url,
    }).link;
}

export function getRecentlyAddedNavigationState(
    item: PortalAddedItem
): WorkspaceNavigationTarget['state'] {
    const safeItem = sanitizeItem(item);
    if (safeItem.source === 'stalker' && safeItem.type !== 'live') {
        return buildStalkerDetailNavigationTarget({
            playlistId: safeItem.playlist_id,
            type: safeItem.type,
            categoryId: safeItem.category_id,
            item: buildStalkerStateItem(safeItem.stalker_item, {
                id: safeItem.id,
                title: safeItem.title,
                type: safeItem.type,
                category_id: safeItem.category_id,
                poster_url: safeItem.poster_url,
            }),
        }).state;
    }

    return buildXtreamNavigationTarget({
        playlistId: safeItem.playlist_id,
        type: safeItem.type,
        categoryId: safeItem.category_id,
        itemId: safeItem.xtream_id,
        title: safeItem.title,
        imageUrl: safeItem.poster_url,
    }).state;
}