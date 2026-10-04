import { inject, Injectable } from '@angular/core';
import { Store } from '@ngrx/store';
import { PlaylistActions, selectAllPlaylistsMeta } from '@iptvnator/m3u-state';
import { firstValueFrom, map } from 'rxjs';
import {
    DatabaseService,
    PlaylistsService,
    RuntimeCapabilitiesService,
    PanelSyncService,
} from '@iptvnator/services';
import {
    Channel,
    extractStalkerItemId,
    extractStalkerItemPoster,
    extractStalkerItemTitle,
    extractStalkerItemType,
    isStalkerRadioItem,
    isM3uRecentlyViewedItem,
    M3uRecentlyViewedItem,
    normalizeStalkerDate,
    Playlist,
    PlaylistMeta,
    PlaylistRecentlyViewedItem,
    PlaylistUpdateState,
    StalkerPortalItem,
} from '@iptvnator/shared/interfaces';
import {
    buildCollectionUid,
    buildXtreamCollectionUid,
    CollectionScope,
    UnifiedCollectionItem,
    xtreamContentType,
} from '@iptvnator/portal/shared/util';
import {
    XTREAM_DATA_SOURCE,
    XtreamContentItem,
} from '@iptvnator/portal/xtream/data-access';

function parseFbDate(ts: any): string {
    if (!ts) return new Date().toISOString();
    const num = Number(ts);
    if (isNaN(num) || num <= 0) return new Date().toISOString();
    try {
        return new Date(num > 9999999999 ? num : num * 1000).toISOString();
    } catch(e) {
        return new Date().toISOString();
    }
}

async function safeFetchJson(url: string, options: any = {}, timeoutMs = 3000): Promise<any> {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const response = await fetch(url, { ...options, signal: controller.signal });
        clearTimeout(id);
        if (!response.ok) return null;
        return await response.json();
    } catch (err) {
        clearTimeout(id);
        return null;
    }
}

const globalUnifiedRecentCache = new Map<string, any>();

type PlaylistWithChannels = Omit<Playlist, 'playlist'> & {
    readonly playlist?: { readonly items?: Channel[] };
};

@Injectable({ providedIn: 'root' })
export class UnifiedRecentDataService {
    private readonly store = inject(Store);
    private readonly dbService = inject(DatabaseService);
    private readonly playlistsService = inject(PlaylistsService);
    private readonly runtime = inject(RuntimeCapabilitiesService);
    private readonly xtreamDataSource = inject(XTREAM_DATA_SOURCE);
    private readonly panelSync = inject(PanelSyncService, { optional: true });

    private async enrichUnifiedItems(items: UnifiedCollectionItem[]): Promise<UnifiedCollectionItem[]> {
        const win = window as any;
        const ipc = win.electron?.ipcRenderer;
        
        let allMeta: PlaylistMeta[] = [];
        try {
            allMeta = await this.getAllMeta();
        } catch { /* best effort */ }

        return await Promise.all(items.map(async (item) => {
            if (item.sourceType === 'xtream' && item.xtreamId != null && item.playlistId) {
                const itemType = (item as any).contentType || (item as any).type || 'vod';
                const cacheKey = `${item.playlistId}:${item.xtreamId}:${itemType}`;
                const cached = globalUnifiedRecentCache.get(cacheKey);

                if (cached) {
                    if (cached.name) item.name = cached.name;
                    if (cached.posterUrl) {
                        item.posterUrl = cached.posterUrl;
                        item.logo = cached.posterUrl;
                    }
                    return item;
                }

                const titleStr = String(item.name || '');
                let isGeneric = !item.name || titleStr === 'Contenido' || titleStr === 'Favorito' || titleStr === 'null' || titleStr.includes('Película') || titleStr.includes('Serie') || titleStr.includes('Canal');
                let noPoster = !item.posterUrl && !item.logo;
                
                if (isGeneric || noPoster) {
                    const pl = allMeta.find((p: any) => p._id === item.playlistId) as any;
                    const cType: 'vod' | 'series' | 'live' = (itemType === 'live' || itemType === 'itv') ? 'live' : ((itemType === 'series' || itemType === 'episode') ? 'series' : 'vod');

                    if (cType === 'live') {
                        const liveChannelsMap = win.__liveChannelsCache?.[item.playlistId];
                        if (liveChannelsMap) {
                            const liveInfo = liveChannelsMap.get(String(item.xtreamId));
                            if (liveInfo) {
                                item.name = liveInfo.name;
                                item.posterUrl = liveInfo.logo;
                                item.logo = liveInfo.logo;
                                isGeneric = false;
                                noPoster = false;
                            }
                        }
                    } else {
                        if (ipc) {
                            try {
                                const content = await ipc.invoke('DB_GET_CONTENT_BY_XTREAM_ID', {
                                    xtreamId: Number(item.xtreamId),
                                    playlistId: item.playlistId,
                                    contentType: cType
                                });
                                const realContent = Array.isArray(content) ? content[0] : content;
                                if (realContent) {
                                    if (isGeneric && realContent.title) {
                                        item.name = realContent.title;
                                        isGeneric = false;
                                    }
                                    if (noPoster && (realContent.poster_url || realContent.backdrop_url || realContent.logo)) {
                                        item.posterUrl = realContent.poster_url || realContent.backdrop_url || realContent.logo;
                                        item.logo = item.posterUrl;
                                        noPoster = false;
                                    }
                                }
                            } catch { /* best effort */ }
                        }

                        if ((isGeneric || noPoster) && pl && pl.serverUrl) {
                            try {
                                const baseUrl = pl.serverUrl.trim().replace(/\/+$/, '');
                                const action = cType === 'series' ? 'get_series_info&series_id=' : 'get_vod_info&vod_id=';
                                const url = `${baseUrl}/player_api.php?username=${pl.username}&password=${pl.password}&action=${action}${item.xtreamId}`;
                                const resp = await safeFetchJson(url);
                                if (resp) {
                                    if (cType === 'series' && resp.info) {
                                        if (isGeneric) item.name = resp.info.name;
                                        if (noPoster) item.posterUrl = resp.info.cover || resp.info.backdrop_path?.[0] || item.posterUrl;
                                    } else if (resp.movie_data || resp.info) {
                                        if (isGeneric) item.name = resp.movie_data?.name || resp.info?.name || resp.info?.movie_name;
                                        if (noPoster) item.posterUrl = resp.movie_data?.poster || resp.info?.movie_image || resp.info?.cover || item.posterUrl;
                                    }
                                    item.logo = item.posterUrl;
                                    isGeneric = false;
                                }
                            } catch { /* best effort */ }
                        }
                    }

                    if (item.name && !isGeneric) {
                        globalUnifiedRecentCache.set(cacheKey, { name: item.name, posterUrl: item.posterUrl });
                    }
                }
            }
            return item;
        }));
    }

    async getRecentItems(
        scope: CollectionScope,
        playlistId?: string,
        portalType?: string
    ): Promise<UnifiedCollectionItem[]> {
        if (scope === 'playlist' && playlistId) {
            return this.getPlaylistRecentItems(playlistId, portalType);
        }

        return this.getAllRecentItems();
    }

    async removeRecentItem(item: UnifiedCollectionItem): Promise<void> {
        if (item.sourceType === 'xtream') {
            if (item.contentId == null) {
                return;
            }

            if (this.hasPortalActivityStorage) {
                await this.dbService.removeRecentItem(
                    item.contentId,
                    item.playlistId
                );
                return;
            }

            await this.xtreamDataSource.removeRecentItem(
                item.contentId,
                item.playlistId
            );
            return;
        }

        if (item.sourceType === 'm3u') {
            const updatedPlaylist = await firstValueFrom(
                this.playlistsService.removeFromM3uRecentlyViewed(
                    item.playlistId,
                    item.streamUrl ?? item.uid.split('::')[2]
                )
            );
            this.dispatchPlaylistRecentUpdate(item.playlistId, updatedPlaylist);
            return;
        }

        const updatedPlaylist = await firstValueFrom(
            this.playlistsService.removeFromPortalRecentlyViewed(
                item.playlistId,
                item.stalkerId ?? item.uid.split('::')[2]
            )
        );
        this.dispatchPlaylistRecentUpdate(item.playlistId, updatedPlaylist);
    }

    async removeRecentItemsBatch(
        items: UnifiedCollectionItem[]
    ): Promise<void> {
        if (items.length === 0) {
            return;
        }

        const xtreamBatch: { contentId: number; playlistId: string }[] = [];
        const groupedByPlaylist = new Map<string, (string | number)[]>();

        for (const item of items) {
            if (item.sourceType === 'xtream') {
                if (item.contentId != null) {
                    xtreamBatch.push({
                        contentId: item.contentId,
                        playlistId: item.playlistId,
                    });
                }
                continue;
            }

            const identity =
                item.sourceType === 'm3u'
                    ? (item.streamUrl ?? item.uid.split('::')[2])
                    : (item.stalkerId ?? item.uid.split('::')[2]);

            if (!identity) {
                continue;
            }

            const existing = groupedByPlaylist.get(item.playlistId) ?? [];
            existing.push(identity);
            groupedByPlaylist.set(item.playlistId, existing);
        }

        const tasks: Promise<unknown>[] = [];

        if (xtreamBatch.length > 0) {
            if (this.hasPortalActivityStorage) {
                tasks.push(this.dbService.removeRecentItemsBatch(xtreamBatch));
            } else {
                tasks.push(
                    ...xtreamBatch.map((item) =>
                        this.xtreamDataSource.removeRecentItem(
                            item.contentId,
                            item.playlistId
                        )
                    )
                );
            }
        }

        for (const [playlistId, identities] of groupedByPlaylist) {
            tasks.push(
                firstValueFrom(
                    this.playlistsService.removeFromPlaylistRecentlyViewedBatch(
                        playlistId,
                        identities
                    )
                ).then((updatedPlaylist) =>
                    this.dispatchPlaylistRecentUpdate(
                        playlistId,
                        updatedPlaylist
                    )
                )
            );
        }

        await Promise.all(tasks);
    }

    async clearRecentItems(
        scope: CollectionScope,
        playlistId?: string
    ): Promise<void> {
        if (scope === 'playlist' && playlistId) {
            if (this.hasPortalActivityStorage) {
                await this.dbService.clearPlaylistRecentItems(playlistId);
            } else {
                await this.xtreamDataSource.clearRecentItems(playlistId);
            }
            const updatedPlaylist = await firstValueFrom(
                this.playlistsService.clearPlaylistRecentlyViewed(playlistId)
            );
            this.dispatchPlaylistRecentUpdate(playlistId, updatedPlaylist);
            return;
        }

        if (this.hasPortalActivityStorage) {
            await this.dbService.clearGlobalRecentlyViewed();
        } else {
            const allMeta = await this.getAllMeta();
            await Promise.all(
                allMeta
                    .filter((playlist) => playlist._id)
                    .filter((playlist) => this.isXtreamPlaylist(playlist))
                    .map((playlist) =>
                        this.xtreamDataSource.clearRecentItems(playlist._id)
                    )
            );
        }
        const playlists = (await firstValueFrom(
            this.playlistsService.getAllPlaylists()
        )) as Playlist[];

        await Promise.all(
            playlists.map(async (playlist) => {
                if (this.isPlaylistBackedRecentPlaylist(playlist)) {
                    const updatedPlaylist = await firstValueFrom(
                        this.playlistsService.clearPlaylistRecentlyViewed(
                            playlist._id
                        )
                    );
                    this.dispatchPlaylistRecentUpdate(
                        playlist._id,
                        updatedPlaylist
                    );
                }
            })
        );
    }

    async recordLivePlayback(
        item: UnifiedCollectionItem
    ): Promise<UnifiedCollectionItem> {
        const viewedAt = new Date().toISOString();

        if (item.sourceType === 'm3u') {
            if (!item.streamUrl) {
                return item;
            }

            const updatedPlaylist = await firstValueFrom(
                this.playlistsService.addM3uRecentlyViewed(item.playlistId, {
                    source: 'm3u',
                    id: item.streamUrl,
                    url: item.streamUrl,
                    title: item.name?.trim() || item.streamUrl,
                    channel_id: item.channelId,
                    poster_url: item.logo ?? undefined,
                    tvg_id: item.tvgId,
                    tvg_name: item.name,
                    category_id: 'live',
                    added_at: viewedAt,
                } satisfies M3uRecentlyViewedItem)
            );

            this.dispatchPlaylistRecentUpdate(item.playlistId, updatedPlaylist);

            return {
                ...item,
                viewedAt,
            };
        }

        if (item.sourceType === 'xtream') {
            const contentId =
                item.contentId ??
                (item.xtreamId != null
                    ? await this.resolveXtreamContentId(item)
                    : null);

            if (contentId != null) {
                if (this.hasPortalActivityStorage) {
                    await this.dbService.addRecentItem(
                        contentId,
                        item.playlistId
                    );
                } else {
                    await this.xtreamDataSource.addRecentItem(
                        contentId,
                        item.playlistId
                    );
                }
            }

            return {
                ...item,
                contentId: contentId ?? item.contentId,
                viewedAt,
            };
        }

        const stalkerItem =
            (item.stalkerItem as StalkerPortalItem | undefined) ?? {};
        const updatedPlaylist = await firstValueFrom(
            this.playlistsService.addPortalRecentlyViewed(item.playlistId, {
                ...stalkerItem,
                id:
                    item.stalkerId ??
                    extractStalkerItemId(stalkerItem) ??
                    item.uid.split('::')[2],
                cmd: item.stalkerCmd ?? stalkerItem.cmd,
                cover:
                    stalkerItem.cover ??
                    item.logo ??
                    item.posterUrl ??
                    undefined,
                logo:
                    stalkerItem.logo ??
                    item.logo ??
                    item.posterUrl ??
                    undefined,
                title: item.name,
                name: stalkerItem.name ?? item.name,
                o_name: stalkerItem.o_name ?? item.name,
                category_id: 'itv',
                added_at: Date.now(),
            })
        );

        this.dispatchPlaylistRecentUpdate(item.playlistId, updatedPlaylist);

        return {
            ...item,
            viewedAt,
        };
    }

    private async getAllRecentItems(): Promise<UnifiedCollectionItem[]> {
        const [xtream, m3u, stalker] = await Promise.all([
            this.getXtreamGlobalRecent(),
            this.getM3uGlobalRecent(),
            this.getStalkerGlobalRecent(),
        ]);

        return [...xtream, ...m3u, ...stalker].sort(
            (a, b) =>
                new Date(b.viewedAt ?? 0).getTime() -
                new Date(a.viewedAt ?? 0).getTime()
        );
    }

    private async getPlaylistRecentItems(
        playlistId: string,
        portalType?: string
    ): Promise<UnifiedCollectionItem[]> {
        if (portalType === 'xtream') {
            return this.getXtreamPlaylistRecent(playlistId);
        }

        if (portalType === 'stalker') {
            return this.getStalkerPlaylistRecent(playlistId);
        }

        return this.getM3uPlaylistRecent(playlistId);
    }

    private get hasPortalActivityStorage(): boolean {
        return this.runtime.supportsPortalActivityStorage;
    }

    private async getXtreamGlobalRecent(): Promise<UnifiedCollectionItem[]> {
        if (!this.hasPortalActivityStorage) {
            const allMeta = await this.getAllMeta();
            const results: UnifiedCollectionItem[] = [];
            for (const meta of allMeta.filter(
                (playlist) => playlist._id && this.isXtreamPlaylist(playlist)
            )) {
                results.push(...(await this.getXtreamPlaylistRecent(meta._id)));
            }
            return results;
        }

        const itemsMap = new Map<string, UnifiedCollectionItem>();

        try {
            const rows = await this.dbService.getGlobalRecentlyViewed();
            (rows || []).forEach((row) => {
                const contentType = xtreamContentType(row.type);
                const uid = buildXtreamCollectionUid(
                    row.playlist_id,
                    contentType,
                    row.xtream_id
                );
                itemsMap.set(uid, {
                    uid,
                    name: row.title,
                    contentType: contentType as any,
                    sourceType: 'xtream' as const,
                    playlistId: row.playlist_id,
                    playlistName: row.playlist_name ?? 'Xtream',
                    logo: row.type === 'live' ? (row.poster_url ?? null) : null,
                    posterUrl: row.type !== 'live' ? (row.poster_url ?? null) : null,
                    xtreamId: row.xtream_id,
                    categoryId: row.category_id,
                    tvgId: row.type === 'live' ? String(row.xtream_id) : undefined,
                    contentId: row.id,
                    viewedAt: normalizeStalkerDate(row.viewed_at),
                });
            });
        } catch { /* best effort */ }

        if (this.panelSync) {
            try {
                const allMeta = await this.getAllMeta();
                const xtreamPlaylists = allMeta.filter((p: any) => !!p.serverUrl);

                for (const pl of xtreamPlaylists) {
                    const plAny = pl as any;
                    const userIdObj = { username: plAny.username, password: plAny.password, server: plAny.serverUrl };
                    const cloudProgress = await (this.panelSync as any).getAllProgress(userIdObj);

                    if (cloudProgress) {
                        for (const fbType of ['Movie', 'Series']) {
                            if (!cloudProgress[fbType]) continue;

                            for (const catId of Object.keys(cloudProgress[fbType])) {
                                const items = fbType === 'Series' ? cloudProgress[fbType][catId] : { [catId]: cloudProgress[fbType][catId] };
                                for (const itemId of Object.keys(items)) {
                                    const data = items[itemId];
                                    if (!data || (!data.timeline && !data.showInContinueWatchingList)) continue;

                                    const xtreamId = Number(itemId);
                                    const contentType = (fbType === 'Movie' ? 'vod' : 'series') as any;
                                    const uid = buildXtreamCollectionUid(pl._id, contentType, xtreamId);
                                    const timestampStr = parseFbDate(data.timestamp);

                                    const existing = itemsMap.get(uid);
                                    if (existing) {
                                        if (new Date(timestampStr).getTime() > new Date(existing.viewedAt ?? 0).getTime()) {
                                            existing.viewedAt = timestampStr;
                                        }
                                        continue;
                                    }

                                    const realTitle = '';
                                    const realPoster = undefined;
                                    const finalCategoryId = '0';

                                    itemsMap.set(uid, {
                                        uid,
                                        name: realTitle,
                                        contentType,
                                        sourceType: 'xtream' as const,
                                        playlistId: pl._id,
                                        playlistName: pl.title || 'Xtream',
                                        logo: realPoster ?? null,
                                        posterUrl: realPoster ?? null,
                                        xtreamId: xtreamId,
                                        categoryId: String(finalCategoryId),
                                        tvgId: undefined,
                                        contentId: xtreamId,
                                        viewedAt: timestampStr,
                                    });
                                }
                            }
                        }
                    }
                }
            } catch { /* best effort */ }
        }

        const finalArray = Array.from(itemsMap.values());
        return await this.enrichUnifiedItems(finalArray);
    }

    private async getXtreamPlaylistRecent(
        playlistId: string
    ): Promise<UnifiedCollectionItem[]> {
        const itemsMap = new Map<string, UnifiedCollectionItem>();
        const meta = await this.getPlaylistMeta(playlistId);

        try {
            if (!this.hasPortalActivityStorage) {
                const rows = await this.xtreamDataSource.getRecentItems(playlistId);
                rows.forEach((row) => {
                    const item = this.mapXtreamContentItem(row, playlistId, meta?.title);
                    itemsMap.set(item.uid, item);
                });
            } else {
                const rows = await this.dbService.getRecentItems(playlistId);
                (rows || []).forEach((row) => {
                    const contentType = xtreamContentType(row.type);
                    const uid = buildXtreamCollectionUid(playlistId, contentType, row.xtream_id);
                    itemsMap.set(uid, {
                        uid,
                        name: row.title,
                        contentType: contentType as any,
                        sourceType: 'xtream' as const,
                        playlistId,
                        playlistName: meta?.title || 'Xtream',
                        logo: row.type === 'live' ? (row.poster_url ?? null) : null,
                        posterUrl: row.type !== 'live' ? (row.poster_url ?? null) : null,
                        xtreamId: row.xtream_id,
                        categoryId: row.category_id,
                        tvgId: row.type === 'live' ? String(row.xtream_id) : undefined,
                        contentId: row.id,
                        viewedAt: normalizeStalkerDate(row.viewed_at),
                    });
                });
            }
        } catch { /* best effort */ }

        const metaAny = meta as any;
        if (this.panelSync && metaAny?.serverUrl) {
            try {
                const userIdObj = { username: metaAny.username, password: metaAny.password, server: metaAny.serverUrl };
                const cloudProgress = await (this.panelSync as any).getAllProgress(userIdObj);

                if (cloudProgress) {
                    for (const fbType of ['Movie', 'Series']) {
                        if (!cloudProgress[fbType]) continue;

                        for (const catId of Object.keys(cloudProgress[fbType])) {
                            const items = fbType === 'Series' ? cloudProgress[fbType][catId] : { [catId]: cloudProgress[fbType][catId] };
                            for (const itemId of Object.keys(items)) {
                                const data = items[itemId];
                                if (!data || (!data.timeline && !data.showInContinueWatchingList)) continue;

                                const xtreamId = Number(itemId);
                                const contentType = (fbType === 'Movie' ? 'vod' : 'series') as any;
                                const uid = buildXtreamCollectionUid(playlistId, contentType, xtreamId);
                                const timestampStr = parseFbDate(data.timestamp);

                                const existing = itemsMap.get(uid);
                                if (existing) {
                                    if (new Date(timestampStr).getTime() > new Date(existing.viewedAt ?? 0).getTime()) {
                                        existing.viewedAt = timestampStr;
                                    }
                                    continue;
                                }

                                const realTitle = '';
                                const realPoster = undefined;
                                const finalCategoryId = '0';

                                itemsMap.set(uid, {
                                    uid,
                                    name: realTitle,
                                    contentType,
                                    sourceType: 'xtream' as const,
                                    playlistId: playlistId,
                                    playlistName: meta?.title || 'Xtream',
                                    logo: realPoster ?? null,
                                    posterUrl: realPoster ?? null,
                                    xtreamId: xtreamId,
                                    categoryId: String(finalCategoryId),
                                    tvgId: undefined,
                                    contentId: xtreamId,
                                    viewedAt: timestampStr,
                                });
                            }
                        }
                    }
                }
            } catch { /* best effort */ }
        }

        const finalArray = Array.from(itemsMap.values());
        return await this.enrichUnifiedItems(finalArray);
    }

    private async resolveXtreamContentId(
        item: UnifiedCollectionItem
    ): Promise<number | null> {
        if (item.xtreamId == null) {
            return null;
        }

        if (!this.hasPortalActivityStorage) {
            const content = await this.xtreamDataSource.getContentByXtreamId(
                item.xtreamId,
                item.playlistId,
                item.contentType
            );
            return content?.id ?? item.xtreamId;
        }

        const content = await this.dbService.getContentByXtreamId(
            item.xtreamId,
            item.playlistId,
            item.contentType
        );

        return content?.id ?? null;
    }

    private mapXtreamContentItem(
        item: XtreamContentItem,
        playlistId: string,
        playlistName?: string
    ): UnifiedCollectionItem {
        const contentType = xtreamContentType(item.type);

        return {
            uid: buildXtreamCollectionUid(
                playlistId,
                contentType,
                item.xtream_id
            ),
            name: item.title,
            contentType,
            sourceType: 'xtream',
            playlistId,
            playlistName: playlistName ?? item.playlist_name ?? 'Xtream',
            logo: contentType === 'live' ? (item.poster_url ?? null) : null,
            posterUrl:
                contentType !== 'live' ? (item.poster_url ?? null) : null,
            xtreamId: item.xtream_id,
            categoryId: item.category_id,
            tvgId: contentType === 'live' ? String(item.xtream_id) : undefined,
            contentId: item.id,
            viewedAt: normalizeStalkerDate(item.viewed_at),
        };
    }

    private async getM3uGlobalRecent(): Promise<UnifiedCollectionItem[]> {
        const allMeta = await this.getAllMeta();
        const results: UnifiedCollectionItem[] = [];

        for (const meta of allMeta.filter((playlist: any) =>
            this.isM3uPlaylist(playlist)
        )) {
            results.push(...(await this.extractM3uRecent(meta)));
        }

        return results;
    }

    private async getM3uPlaylistRecent(
        playlistId: string
    ): Promise<UnifiedCollectionItem[]> {
        const meta = await this.getPlaylistMeta(playlistId);
        return meta ? this.extractM3uRecent(meta) : [];
    }

    private async getStalkerGlobalRecent(): Promise<UnifiedCollectionItem[]> {
        const allMeta = await this.getAllMeta();
        const results: UnifiedCollectionItem[] = [];

        for (const meta of allMeta.filter((playlist: any) =>
            Boolean(playlist.macAddress)
        )) {
            results.push(...(await this.extractStalkerRecent(meta)));
        }

        return results;
    }

    private async getStalkerPlaylistRecent(
        playlistId: string
    ): Promise<UnifiedCollectionItem[]> {
        const meta = await this.getPlaylistMeta(playlistId);
        return meta ? this.extractStalkerRecent(meta) : [];
    }

    private async extractM3uRecent(
        meta: PlaylistMeta
    ): Promise<UnifiedCollectionItem[]> {
        const recentItems = this.sortRecentItems(meta.recentlyViewed).filter(
            isM3uRecentlyViewedItem
        );

        if (recentItems.length === 0) {
            return [];
        }

        let playlist: PlaylistWithChannels | undefined;
        try {
            playlist = (await firstValueFrom(
                this.playlistsService.getPlaylistById(meta._id)
            )) as PlaylistWithChannels | undefined;
        } catch {
            return [];
        }

        const channels = playlist?.playlist?.items ?? [];
        const channelsByUrl = new Map<string, Channel>(
            channels
                .filter((channel) => channel.url?.trim())
                .map((channel) => [channel.url.trim(), channel] as const)
        );
        const channelsById = new Map<string, Channel>(
            channels
                .filter((channel) => channel.id?.trim())
                .map((channel) => [channel.id.trim(), channel] as const)
        );
        const seenUrls = new Set<string>();

        return recentItems
            .map((recentItem) => {
                const channel =
                    channelsByUrl.get(recentItem.url.trim()) ||
                    (recentItem.channel_id
                        ? channelsById.get(String(recentItem.channel_id).trim())
                        : undefined);
                const fallbackSourceId =
                    recentItem.url?.trim() ||
                    String(recentItem.channel_id ?? '').trim();

                if (!channel?.url || seenUrls.has(channel.url)) {
                    return null;
                }

                seenUrls.add(channel.url);

                return {
                    uid: buildCollectionUid(
                        'm3u',
                        meta._id,
                        fallbackSourceId || channel.url || channel.id
                    ),
                    name:
                        recentItem.title?.trim() ||
                        channel.name ||
                        recentItem.tvg_name?.trim() ||
                        recentItem.url,
                    contentType: 'live' as const,
                    sourceType: 'm3u' as const,
                    playlistId: meta._id,
                    playlistName: meta.title || meta.filename || 'M3U',
                    logo: channel.tvg?.logo ?? recentItem.poster_url ?? null,
                    streamUrl: channel.url,
                    channelId: channel.id,
                    radio: channel.radio,
                    m3uChannel: channel,
                    tvgId:
                        channel.tvg?.id ||
                        recentItem.tvg_id ||
                        recentItem.tvg_name ||
                        channel.tvg?.name ||
                        channel.name,
                    categoryId: recentItem.category_id,
                    viewedAt: normalizeStalkerDate(recentItem.added_at),
                } satisfies UnifiedCollectionItem;
            })
            .filter((item) => item !== null) as UnifiedCollectionItem[];
    }

    private async extractStalkerRecent(
        meta: PlaylistMeta
    ): Promise<UnifiedCollectionItem[]> {
        const recentItems = this.sortRecentItems(meta.recentlyViewed).filter(
            (item): item is StalkerPortalItem => !isM3uRecentlyViewedItem(item)
        );

        if (recentItems.length === 0) {
            return [];
        }

        let playlist: Playlist | undefined;
        try {
            playlist = (await firstValueFrom(
                this.playlistsService.getPlaylistById(meta._id)
            )) as Playlist | undefined;
        } catch {
            return [];
        }

        return recentItems.map((item, index) => {
            const stalkerId = extractStalkerItemId(item, meta._id, index);
            const contentType = extractStalkerItemType(item);
            const isRadio = isStalkerRadioItem(item);
            const imageUrl = extractStalkerItemPoster(item) || null;

            return {
                uid: buildCollectionUid('stalker', meta._id, stalkerId),
                name: extractStalkerItemTitle(item),
                contentType,
                sourceType: 'stalker' as const,
                playlistId: meta._id,
                playlistName: meta.title || meta.filename || 'Stalker Portal',
                logo: contentType === 'live' ? imageUrl : null,
                posterUrl: contentType !== 'live' ? imageUrl : null,
                tvgId: contentType === 'live' ? stalkerId : undefined,
                radio: isRadio ? 'true' : undefined,
                stalkerId,
                stalkerCmd: item.cmd,
                stalkerPortalUrl: playlist?.portalUrl ?? playlist?.url,
                stalkerMacAddress: playlist?.macAddress,
                categoryId: item.category_id,
                stalkerItem: item,
                viewedAt: normalizeStalkerDate(item.added_at),
            } satisfies UnifiedCollectionItem;
        });
    }

    private async getPlaylistMeta(
        id: string
    ): Promise<PlaylistMeta | undefined> {
        return (await this.getAllMeta()).find(
            (playlist) => playlist._id === id
        );
    }

    private async getAllMeta(): Promise<PlaylistMeta[]> {
        return firstValueFrom(
            this.store
                .select(selectAllPlaylistsMeta)
                .pipe(map((playlists) => playlists as PlaylistMeta[]))
        );
    }

    private sortRecentItems(
        items: PlaylistMeta['recentlyViewed']
    ): PlaylistRecentlyViewedItem[] {
        if (!Array.isArray(items)) {
            return [];
        }

        return [...items].sort(
            (a, b) =>
                new Date(normalizeStalkerDate(b.added_at ?? '')).getTime() -
                new Date(normalizeStalkerDate(a.added_at ?? '')).getTime()
        );
    }

    private dispatchPlaylistRecentUpdate(
        playlistId: string,
        updatedPlaylist: Partial<Pick<Playlist, 'recentlyViewed'>> | undefined
    ): void {
        this.store.dispatch(
            PlaylistActions.updatePlaylistMeta({
                playlist: {
                    _id: playlistId,
                    recentlyViewed: updatedPlaylist?.recentlyViewed ?? [],
                    updateState: PlaylistUpdateState.UPDATED,
                } as PlaylistMeta,
            })
        );
    }

    private isM3uPlaylist(playlist: any): boolean {
        return !playlist.serverUrl && !playlist.macAddress;
    }

    private isXtreamPlaylist(playlist: any): boolean {
        return Boolean(playlist.serverUrl) && !playlist.macAddress;
    }

    private isPlaylistBackedRecentPlaylist(playlist: any): boolean {
        return Boolean(playlist.macAddress) || this.isM3uPlaylist(playlist);
    }
}