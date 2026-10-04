import {
    Injectable,
    NgZone,
    computed,
    effect,
    inject,
    signal,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { Store } from '@ngrx/store';
import { TranslateService } from '@ngx-translate/core';
import {
    PlaylistActions,
    selectAllPlaylistsMeta,
    selectPlaylistsLoadingFlag,
} from '@iptvnator/m3u-state';
import { firstValueFrom, startWith } from 'rxjs';
import {
    DatabaseService,
    GlobalRecentlyAddedKind,
    PlaylistsService,
    RuntimeCapabilitiesService,
    PanelSyncService
} from '@iptvnator/services';
import {
    XTREAM_DATA_SOURCE,
    XtreamContentItem,
} from '@iptvnator/portal/xtream/data-access';
import {
    buildPlaylistRecentItems,
    Channel,
    M3uFavoriteChannel,
    Playlist,
    PortalAddedItem,
    PortalActivityItem,
    PlaylistMeta,
    PortalActivityType,
    PortalFavoriteItem,
    PortalRecentItem,
    stalkerItemMatchesId,
} from '@iptvnator/shared/interfaces';
import {
    buildStalkerFavoriteItems,
    getActivityTypeLabelKey,
    mapDbFavoriteToItem,
    mapDbRecentlyAddedToItem,
    mapDbRecentToItem,
    toDateTimestamp,
    toTimestamp,
} from './dashboard-mappers';
import {
    PORTAL_PLAYBACK_POSITIONS,
    WorkspaceNavigationTarget,
} from '@iptvnator/portal/shared/util';
import type { PlaybackPositionData } from '@iptvnator/shared/interfaces';
import {
    getGlobalFavoriteLink as getGlobalFavoriteLinkUtil,
    getGlobalFavoriteNavigationState as getGlobalFavoriteNavigationStateUtil,
    getPlaylistLink as getPlaylistLinkUtil,
    getRecentItemLink as getRecentItemLinkUtil,
    getRecentItemNavigationState as getRecentItemNavigationStateUtil,
    getRecentlyAddedLink as getRecentlyAddedLinkUtil,
    getRecentlyAddedNavigationState as getRecentlyAddedNavigationStateUtil,
    isTypeInKind as isTypeInKindUtil,
    type DashboardContentKind,
} from './dashboard-navigation.util';

export type { DashboardContentKind };

const globalContentCache = new Map<string, any>();

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

function playbackPositionMapKey(
    playlistId: string,
    contentXtreamId: number,
    contentType: 'vod' | 'episode'
): string {
    return `${playlistId}::${contentXtreamId}::${contentType}`;
}

function seriesPlaybackPositionMapKey(
    playlistId: string,
    seriesXtreamId: number
): string {
    return `${playlistId}::${seriesXtreamId}`;
}

function newestPlaybackPosition(
    current: PlaybackPositionData | null | undefined,
    candidate: PlaybackPositionData | null | undefined
): PlaybackPositionData | null {
    if (!current) {
        return candidate ?? null;
    }
    if (!candidate) {
        return current;
    }
    return (candidate.updatedAt ?? '') > (current.updatedAt ?? '')
        ? candidate
        : current;
}

export type GlobalRecentItem = PortalRecentItem;
export type DashboardFavoriteItem = PortalFavoriteItem;
export type DashboardRecentlyAddedItem = PortalAddedItem;
export type DashboardRecentlyAddedFilterKind = GlobalRecentlyAddedKind;

@Injectable({ providedIn: 'root' })
export class DashboardDataService {
    private readonly store = inject(Store);
    private readonly dbService = inject(DatabaseService);
    private readonly xtreamDataSource = inject(XTREAM_DATA_SOURCE);
    private readonly playlistsService = inject(PlaylistsService);
    private readonly runtime = inject(RuntimeCapabilitiesService);
    private readonly ngZone = inject(NgZone);
    private readonly translate = inject(TranslateService);
    private readonly playbackPositions = inject(PORTAL_PLAYBACK_POSITIONS);
    private readonly panelSync = inject(PanelSyncService, { optional: true });
    private readonly favoritesAutoRefreshEnabled = signal(false);
    private readonly languageTick = toSignal(
        this.translate.onLangChange.pipe(startWith(null)),
        { initialValue: null }
    );

    private readonly xtreamGlobalRecentItems = signal<GlobalRecentItem[]>([]);
    private readonly panelGlobalRecentItems = signal<GlobalRecentItem[]>([]);
    private readonly xtreamRecentlyAddedItemsState = signal<DashboardRecentlyAddedItem[]>([]);
    private readonly xtreamGlobalFavorites = signal<DashboardFavoriteItem[]>([]);
    private readonly panelGlobalFavorites = signal<DashboardFavoriteItem[]>([]);
    private readonly m3uPlaylistFavoritesMap = signal<Map<string, DashboardFavoriteItem[]>>(new Map());

    private readonly m3uFavoritesCache = new Map<
        string,
        { fingerprint: string; items: DashboardFavoriteItem[] }
    >();

    private readonly m3uGlobalFavorites = computed<DashboardFavoriteItem[]>(
        () => {
            const map = this.m3uPlaylistFavoritesMap();
            const all: DashboardFavoriteItem[] = [];
            map.forEach((items) => {
                for (const item of items) {
                    all.push(item);
                }
            });
            return all;
        }
    );
    private readonly globalRecentLoadingState = signal(true);
    private readonly globalRecentLoadedState = signal(false);
    private readonly globalRecentDbLoadedState = signal(
        !this.hasPortalActivityStorage
    );
    private readonly globalFavoritesLoadingState = signal(true);
    private readonly globalFavoritesLoadedState = signal(false);
    private readonly xtreamGlobalFavoritesLoadedState = signal(false);
    private readonly playlistBackedGlobalFavoritesLoadedState = signal(false);
    private readonly xtreamRecentlyAddedLoadingState = signal(true);
    private readonly xtreamRecentlyAddedLoadedState = signal(false);
    readonly playlists = this.store.selectSignal(selectAllPlaylistsMeta);
    readonly playlistsLoaded = this.store.selectSignal(
        selectPlaylistsLoadingFlag
    );
    readonly xtreamPlaylistCount = computed(
        () => this.playlists().filter((playlist: any) => !!playlist.serverUrl).length
    );
    readonly hasXtreamPlaylists = computed(
        () => this.xtreamPlaylistCount() > 0
    );
    readonly globalRecentLoading = this.globalRecentLoadingState.asReadonly();
    readonly globalRecentLoaded = this.globalRecentLoadedState.asReadonly();
    readonly globalFavoritesLoading =
        this.globalFavoritesLoadingState.asReadonly();
    readonly globalFavoritesLoaded =
        this.globalFavoritesLoadedState.asReadonly();
    readonly xtreamRecentlyAddedLoading =
        this.xtreamRecentlyAddedLoadingState.asReadonly();
    readonly xtreamRecentlyAddedLoaded =
        this.xtreamRecentlyAddedLoadedState.asReadonly();
    readonly xtreamRecentlyAddedItems =
        this.xtreamRecentlyAddedItemsState.asReadonly();

    private get hasPortalActivityStorage(): boolean {
        return this.runtime.supportsPortalActivityStorage;
    }

    readonly dashboardReady = computed(
        () =>
            this.playlistsLoaded() &&
            this.globalRecentLoaded() &&
            this.globalFavoritesLoaded() &&
            (!this.hasXtreamPlaylists() || this.xtreamRecentlyAddedLoaded())
    );

    private readonly playlistFavoritesReloadKey = computed(() => {
        if (!this.playlistsLoaded()) {
            return null;
        }

        return this.playlists()
            .map((playlist: any) =>
                [
                    playlist._id,
                    playlist.serverUrl
                        ? 'xtream'
                        : playlist.macAddress
                          ? 'stalker'
                          : 'm3u',
                    JSON.stringify(playlist.favorites ?? []),
                ].join('::')
            )
            .join('|');
    });

    readonly playlistBackedGlobalRecentItems = computed<GlobalRecentItem[]>(
        () => {
            this.languageTick();
            return buildPlaylistRecentItems(this.playlists(), {
                stalker: this.translateText(
                    'WORKSPACE.DASHBOARD.STALKER_PORTAL'
                ),
                m3u: this.translateText('WORKSPACE.DASHBOARD.M3U'),
            });
        }
    );

    readonly globalRecentItems = computed<GlobalRecentItem[]>(() => {
        const all = [
            ...this.panelGlobalRecentItems(),
            ...this.xtreamGlobalRecentItems(),
            ...this.playlistBackedGlobalRecentItems(),
        ];
        const seen = new Set<string>();
        const unique = [];
        for (const item of all) {
            const key = `${item.playlist_id}-${item.xtream_id || item.id}`;
            if (!seen.has(key)) {
                seen.add(key);
                unique.push(item);
            }
        }
        return unique.sort((a, b) => toDateTimestamp(b.viewed_at) - toDateTimestamp(a.viewed_at)).slice(0, 500);
    });

    readonly globalRecentVodItems = computed<GlobalRecentItem[]>(() =>
        this.globalRecentItems().filter(
            (item) => item.type === 'movie' || item.type === 'series'
        )
    );

    readonly globalRecentLiveItems = computed<GlobalRecentItem[]>(() =>
        this.globalRecentItems().filter((item) => item.type === 'live')
    );

    readonly globalFavoriteLiveItems = computed<DashboardFavoriteItem[]>(() =>
        this.globalFavoriteItems().filter((item) => item.type === 'live')
    );

    private readonly playbackPositionsMap = signal<
        Map<string, PlaybackPositionData>
    >(new Map());
    private readonly playbackPositionsBySeriesMap = signal<
        Map<string, PlaybackPositionData>
    >(new Map());

    readonly playbackPositions$ = this.playbackPositionsMap.asReadonly();

    getPlaybackPositionForItem(
        item: PortalActivityItem
    ): PlaybackPositionData | null {
        if (item.type !== 'movie' && item.type !== 'series') {
            return null;
        }
        const xtreamId =
            typeof item.xtream_id === 'number'
                ? item.xtream_id
                : Number(item.xtream_id);
        if (!Number.isFinite(xtreamId)) {
            return null;
        }

        if (item.type === 'movie') {
            const key = playbackPositionMapKey(
                item.playlist_id,
                xtreamId,
                'vod'
            );
            return this.playbackPositionsMap().get(key) ?? null;
        }

        const episodePosition =
            this.playbackPositionsMap().get(
                playbackPositionMapKey(item.playlist_id, xtreamId, 'episode')
            ) ?? null;
        const seriesPosition =
            this.playbackPositionsBySeriesMap().get(
                seriesPlaybackPositionMapKey(item.playlist_id, xtreamId)
            ) ?? null;
        return newestPlaybackPosition(episodePosition, seriesPosition);
    }

    async reloadPlaybackPositions(): Promise<void> {
        const playlistIds = new Set<string>();
        for (const item of this.globalRecentItems()) {
            if (item.type === 'movie' || item.type === 'series') {
                playlistIds.add(item.playlist_id);
            }
        }
        if (playlistIds.size === 0) {
            this.playbackPositionsMap.set(new Map());
            this.playbackPositionsBySeriesMap.set(new Map());
            return;
        }

        const next = new Map<string, PlaybackPositionData>();
        const nextBySeries = new Map<string, PlaybackPositionData>();
        for (const playlistId of playlistIds) {
            try {
                const positions =
                    await this.playbackPositions.getAllPlaybackPositions(
                        playlistId
                    );
                for (const position of positions) {
                    next.set(
                        playbackPositionMapKey(
                            playlistId,
                            position.contentXtreamId,
                            position.contentType
                        ),
                        position
                    );
                    if (
                        position.contentType === 'episode' &&
                        Number.isFinite(position.seriesXtreamId)
                    ) {
                        const seriesKey = seriesPlaybackPositionMapKey(
                            playlistId,
                            position.seriesXtreamId as number
                        );
                        nextBySeries.set(
                            seriesKey,
                            newestPlaybackPosition(
                                nextBySeries.get(seriesKey),
                                position
                            ) as PlaybackPositionData
                        );
                    }
                }
            } catch { /* best effort */ }
        }

        this.ngZone.run(() => {
            this.playbackPositionsMap.set(next);
            this.playbackPositionsBySeriesMap.set(nextBySeries);
        });
    }

    readonly stalkerGlobalFavorites = computed<DashboardFavoriteItem[]>(() => {
        this.languageTick();
        return buildStalkerFavoriteItems(
            this.playlists(),
            this.translateText('WORKSPACE.DASHBOARD.STALKER_PORTAL')
        );
    });

    readonly globalFavoriteItems = computed(() => {
        const all = [
            ...this.panelGlobalFavorites(),
            ...this.xtreamGlobalFavorites(),
            ...this.m3uGlobalFavorites(),
            ...this.stalkerGlobalFavorites(),
        ];
        const seen = new Set<string>();
        const unique = [];
        for (const item of all) {
            const key = `${item.playlist_id}-${item.xtream_id || item.id}`;
            if (!seen.has(key)) {
                seen.add(key);
                unique.push(item);
            }
        }
        return unique.sort((a, b) => toTimestamp(b.added_at) - toTimestamp(a.added_at)).slice(0, 500);
    });

    private readonly recentPlaylistActivityTimestamps = computed(() => {
        const timestamps = new Map<string, number>();

        for (const item of this.globalRecentItems()) {
            const viewedAt = toDateTimestamp(item.viewed_at);
            const current = timestamps.get(item.playlist_id) ?? 0;

            if (viewedAt > current) {
                timestamps.set(item.playlist_id, viewedAt);
            }
        }

        return timestamps;
    });

    constructor() {
        effect(() => {
            this.playlistFavoritesReloadKey();
            if (
                !this.playlistsLoaded() ||
                !this.favoritesAutoRefreshEnabled()
            ) {
                return;
            }

            void this.reloadPlaylistBackedGlobalFavorites();
        });

        effect(() => {
            this.playlistsLoaded();
            this.finishInitialGlobalRecentLoadIfReady();
            this.finishInitialGlobalFavoritesLoadIfReady();
        });

        effect(() => {
            if (this.hasXtreamPlaylists()) {
                return;
            }

            this.ngZone.run(() => {
                this.xtreamRecentlyAddedItemsState.set([]);
                this.xtreamRecentlyAddedLoadingState.set(false);
                this.xtreamRecentlyAddedLoadedState.set(true);
            });
        });

        setInterval(() => {
            void this.syncFromPanel();
        }, 10000);
        
        setTimeout(() => {
            void this.syncFromPanel();
        }, 2000);
    }

    private async enrichDashboardItems<T extends { xtream_id?: number | string, playlist_id?: string, title?: string, poster_url?: string, backdrop_url?: string, type?: string }>(items: T[]): Promise<T[]> {
        const win = window as any;
        const ipc = win.electron?.ipcRenderer;

        for (const item of items) {
            if (item.xtream_id && item.playlist_id) {
                const rawItemType = (item as any).type || (item as any).contentType || 'vod';
                const cacheKey = `${item.playlist_id}:${item.xtream_id}`;
                const cached = globalContentCache.get(cacheKey);

                if (cached) {
                    if (cached.title) item.title = cached.title;
                    if (cached.poster_url) {
                        item.poster_url = cached.poster_url;
                        item.backdrop_url = cached.poster_url;
                    }
                    continue;
                }

                const titleStr = String(item.title || '');
                const tLower = titleStr.toLowerCase();
                let isGeneric = !item.title || tLower === 'contenido' || tLower === 'favorito' || tLower === 'null' || tLower.includes('película') || tLower.includes('pelicula') || tLower.includes('serie') || tLower.includes('canal');
                let noPoster = !item.poster_url && !item.backdrop_url;

                if (rawItemType === 'live' || rawItemType === 'itv') {
                    let liveChannelsMap = win.__liveChannelsCache?.[item.playlist_id];
                    
                    const pl = this.playlists().find((p: any) => p._id === item.playlist_id) as any;
                    if (!liveChannelsMap && pl && pl.serverUrl) {
                        try {
                            const baseUrl = pl.serverUrl.trim().replace(/\/+$/, '');
                            const liveUrl = `${baseUrl}/player_api.php?username=${pl.username}&password=${pl.password}&action=get_live_streams`;
                            const liveResp = await safeFetchJson(liveUrl);
                            liveChannelsMap = new Map();
                            if (Array.isArray(liveResp)) {
                                for (const ch of liveResp) {
                                    liveChannelsMap.set(String(ch.stream_id), { name: ch.name, logo: ch.stream_icon, category_id: ch.category_id });
                                }
                            }
                            win.__liveChannelsCache = win.__liveChannelsCache || {};
                            win.__liveChannelsCache[item.playlist_id] = liveChannelsMap;
                        } catch { /* best effort */ }
                    }

                    if (liveChannelsMap) {
                        const liveInfo = liveChannelsMap.get(String(item.xtream_id));
                        if (liveInfo) {
                            item.title = liveInfo.name;
                            item.poster_url = liveInfo.logo;
                            item.backdrop_url = liveInfo.logo;
                            isGeneric = false;
                            noPoster = false;
                        }
                    }
                    if (item.title && !isGeneric) {
                        globalContentCache.set(cacheKey, { title: item.title, poster_url: item.poster_url });
                    }
                    continue; 
                }

                if (isGeneric || noPoster) {
                    const pl = this.playlists().find((p: any) => p._id === item.playlist_id) as any;
                    
                    if (ipc) {
                        try {
                            const cType = rawItemType === 'series' || rawItemType === 'episode' ? 'series' : 'movie';
                            const content = await ipc.invoke('DB_GET_CONTENT_BY_XTREAM_ID', {
                                xtreamId: Number(item.xtream_id),
                                playlistId: item.playlist_id,
                                contentType: cType
                            });
                            const realContent = Array.isArray(content) ? content[0] : content;
                            if (realContent) {
                                if (isGeneric && realContent.title) {
                                    item.title = realContent.title;
                                    isGeneric = false;
                                }
                                if (noPoster && (realContent.poster_url || realContent.backdrop_url || realContent.logo)) {
                                    item.poster_url = realContent.poster_url || realContent.backdrop_url || realContent.logo;
                                    item.backdrop_url = item.poster_url;
                                    noPoster = false;
                                }
                            }
                        } catch { /* best effort */ }
                    }

                    if ((isGeneric || noPoster) && pl && pl.serverUrl) {
                        try {
                            const baseUrl = pl.serverUrl.trim().replace(/\/+$/, '');
                            const action = rawItemType === 'series' || rawItemType === 'episode' ? 'get_series_info&series_id=' : 'get_vod_info&vod_id=';
                            const url = `${baseUrl}/player_api.php?username=${pl.username}&password=${pl.password}&action=${action}${item.xtream_id}`;
                            const resp = await safeFetchJson(url);
                            if (resp) {
                                if ((rawItemType === 'series' || rawItemType === 'episode') && resp.info) {
                                    if (isGeneric) item.title = resp.info.name;
                                    if (noPoster) item.poster_url = resp.info.cover || resp.info.backdrop_path?.[0] || item.poster_url;
                                } else if (resp.movie_data || resp.info) {
                                    if (isGeneric) item.title = resp.movie_data?.name || resp.info?.name || resp.info?.movie_name;
                                    if (noPoster) item.poster_url = resp.movie_data?.poster || resp.info?.movie_image || resp.info?.cover || item.poster_url;
                                }
                                item.backdrop_url = item.poster_url;
                                isGeneric = false;
                            }
                        } catch { /* best effort */ }
                    }
                    
                    if (item.title && item.title !== 'Contenido' && item.title !== 'Favorito' && !item.title.includes('Película') && !item.title.includes('Serie') && !item.title.includes('Canal')) {
                        globalContentCache.set(cacheKey, { title: item.title, poster_url: item.poster_url });
                    }
                }
            }
        }
        return items;
    }

    private async syncFromPanel() {
        if (!this.panelSync) return;
        const playlists = this.playlists();
        const win = window as any;
        const ipc = win.electron?.ipcRenderer;

        let memoryRecents: GlobalRecentItem[] = [];
        let memoryFavorites: DashboardFavoriteItem[] = [];
        const memoryPositions = new Map<string, PlaybackPositionData>();
        const nextBySeries = new Map<string, PlaybackPositionData>();

        for (const pl of playlists) {
            const plAny = pl as any;
            if (!plAny.serverUrl) continue;
            try {
                const userIdObj = { username: plAny.username, password: plAny.password, server: plAny.serverUrl };
                const baseUrl = plAny.serverUrl.trim().replace(/\/+$/, '');
                
                let liveChannelsMap = win.__liveChannelsCache?.[pl._id];
                if (!liveChannelsMap) {
                    try {
                        const liveUrl = `${baseUrl}/player_api.php?username=${plAny.username}&password=${plAny.password}&action=get_live_streams`;
                        const liveResp = await safeFetchJson(liveUrl);
                        liveChannelsMap = new Map();
                        if (Array.isArray(liveResp)) {
                            for (const ch of liveResp) {
                                liveChannelsMap.set(String(ch.stream_id), { name: ch.name, logo: ch.stream_icon, category_id: ch.category_id });
                            }
                        }
                        win.__liveChannelsCache = win.__liveChannelsCache || {};
                        win.__liveChannelsCache[pl._id] = liveChannelsMap;
                    } catch { /* best effort */ }
                }

                const [cloudProgress, cloudFavorites] = await Promise.all([
                    (this.panelSync as any).getAllProgress(userIdObj),
                    (this.panelSync as any).getAllFavorites(userIdObj)
                ]);

                if (cloudProgress) {
                    const processCloud = async (fbType: string, uiType: 'movie' | 'series', dbType: 'vod' | 'episode') => {
                        if (!cloudProgress[fbType]) return;
                        for (const catId of Object.keys(cloudProgress[fbType])) {
                            const items = fbType === 'Series' ? cloudProgress[fbType][catId] : { [catId]: cloudProgress[fbType][catId] };
                            const cId = fbType === 'Series' ? catId : undefined;
                            
                            for (const itemId of Object.keys(items)) {
                                const data = items[itemId];
                                if (data && data.timeline > 0) {
                                    const episodeId = Number(itemId);
                                    const seriesId = cId ? Number(cId) : undefined;
                                    const targetLookupId = seriesId ?? episodeId;

                                    let realTitle = data.title && data.title !== 'null' ? data.title : undefined;
                                    const realPoster = data.thumbnail && data.thumbnail !== 'null' ? data.thumbnail : undefined;
                                    const finalCategoryId = data.categoryId || data.category_id || '0';

                                    if (!realTitle || realTitle === '' || realTitle.includes('Sincronizado') || realTitle === 'Contenido') {
                                        realTitle = data.episodeName || (uiType === 'movie' ? `Película ${targetLookupId}` : `Serie ${targetLookupId}`);
                                    }

                                    const viewedDate = data.timestamp ? new Date(data.timestamp * 1000).toISOString() : new Date().toISOString();
                                    
                                    memoryRecents.push({
                                        id: targetLookupId,
                                        xtream_id: targetLookupId,
                                        title: realTitle,
                                        type: uiType,
                                        playlist_id: pl._id,
                                        playlist_name: pl.title || 'Xtream',
                                        viewed_at: viewedDate,
                                        category_id: finalCategoryId,
                                        poster_url: realPoster,
                                        backdrop_url: realPoster,
                                        source: 'xtream'
                                    });

                                    const posData: PlaybackPositionData = {
                                        contentXtreamId: episodeId,
                                        contentType: dbType,
                                        seriesXtreamId: seriesId,
                                        positionSeconds: data.timeline,
                                        durationSeconds: data.duration || (data.timeline * 1.25),
                                        updatedAt: new Date((data.timestamp || 0) * 1000).toISOString()
                                    };
                                    
                                    memoryPositions.set(playbackPositionMapKey(pl._id, episodeId, dbType), posData);
                                    
                                    if (dbType === 'episode' && seriesId) {
                                        const sKey = seriesPlaybackPositionMapKey(pl._id, seriesId);
                                        nextBySeries.set(sKey, newestPlaybackPosition(nextBySeries.get(sKey), posData) as PlaybackPositionData);
                                    }
                                    
                                    if (ipc) {
                                        await ipc.invoke('DB_SAVE_PLAYBACK_POSITION', {
                                            playlistId: pl._id,
                                            data: posData
                                        });
                                    }
                                }
                            }
                        }
                    };
                    await processCloud('Movie', 'movie', 'vod');
                    await processCloud('Series', 'series', 'episode');
                }

                if (cloudFavorites) {
                    for (const type of ['Movie', 'Series', 'LiveTv']) {
                        if (!cloudFavorites[type]) continue;
                        for (const itemId of Object.keys(cloudFavorites[type])) {
                            const data = cloudFavorites[type][itemId];
                            let thumb = undefined;
                            let favTitle = undefined;
                            let finalCategoryId = '0';
                            
                            if (typeof data === 'object' && data !== null) {
                                thumb = data.thumbnail && data.thumbnail !== 'null' ? data.thumbnail : undefined;
                                if (data.title && data.title !== 'null') favTitle = data.title;
                            }
                            
                            const xtreamId = Number(itemId);

                            if (type === 'LiveTv') {
                                const liveInfo = liveChannelsMap?.get(String(xtreamId));
                                if (liveInfo) {
                                    favTitle = liveInfo.name;
                                    thumb = liveInfo.logo;
                                    finalCategoryId = liveInfo.category_id;
                                }
                            }

                            if (!favTitle || favTitle === 'Favorito' || favTitle === '' || favTitle === 'Contenido') {
                                if (type === 'LiveTv') favTitle = `Canal ${xtreamId}`;
                                else if (type === 'Movie') favTitle = `Película ${xtreamId}`;
                                else if (type === 'Series') favTitle = `Serie ${xtreamId}`;
                                else favTitle = 'Favorito';
                            }

                            const addedSeconds = typeof data === 'number' ? data : Number(data?.timestamp) || 0;
                            const addedDate = addedSeconds > 0 ? new Date(addedSeconds * 1000).toISOString() : new Date().toISOString();
                            
                            memoryFavorites.push({
                                id: xtreamId,
                                xtream_id: xtreamId,
                                title: favTitle,
                                type: type === 'Movie' ? 'movie' : type === 'Series' ? 'series' : 'live',
                                playlist_id: pl._id,
                                playlist_name: pl.title || 'Xtream',
                                added_at: addedDate,
                                category_id: finalCategoryId,
                                poster_url: thumb,
                                backdrop_url: thumb,
                                source: 'xtream'
                            });
                        }
                    }
                }
            } catch { /* best effort */ }
        }

        memoryRecents = await this.enrichDashboardItems(memoryRecents);
        memoryFavorites = await this.enrichDashboardItems(memoryFavorites);

        this.ngZone.run(() => {
            this.panelGlobalRecentItems.set(memoryRecents);
            this.panelGlobalFavorites.set(memoryFavorites);
            
            if (memoryPositions.size > 0) {
                const currentPos = new Map(this.playbackPositionsMap());
                memoryPositions.forEach((v, k) => currentPos.set(k, v));
                this.playbackPositionsMap.set(currentPos);
            }
            if (nextBySeries.size > 0) {
                const currentSeriesPos = new Map(this.playbackPositionsBySeriesMap());
                nextBySeries.forEach((v, k) => currentSeriesPos.set(k, v));
                this.playbackPositionsBySeriesMap.set(currentSeriesPos);
            }
        });

        await this.reloadPlaybackPositions();
    }

    readonly stats = computed(() => {
        const items = this.playlists();
        return {
            total: items.length,
            xtream: items.filter((item: any) => !!item.serverUrl).length,
            stalker: items.filter((item: any) => !!item.macAddress).length,
            m3u: items.filter((item: any) => !item.serverUrl && !item.macAddress)
                .length,
        };
    });

    readonly recentPlaylists = computed(() =>
        [...this.playlists()]
            .sort((a, b) => {
                const activityDelta =
                    this.getPlaylistActivityTimestamp(b) -
                    this.getPlaylistActivityTimestamp(a);
                if (activityDelta !== 0) {
                    return activityDelta;
                }

                const metadataDelta =
                    this.getRecentTimestamp(b) - this.getRecentTimestamp(a);
                if (metadataDelta !== 0) {
                    return metadataDelta;
                }

                return a._id.localeCompare(b._id);
            })
            .slice(0, 12)
    );

    readonly quickRecent = computed(() => this.recentPlaylists().slice(0, 4));

    async reloadGlobalRecentItems(): Promise<void> {
        if (!this.globalRecentLoaded()) {
            this.globalRecentLoadingState.set(true);
        }

        if (!this.hasPortalActivityStorage) {
            let recentItems = await this.loadPwaXtreamGlobalRecentItems();
            recentItems = await this.enrichDashboardItems(recentItems);
            this.ngZone.run(() =>
                this.xtreamGlobalRecentItems.set(recentItems)
            );
            this.globalRecentDbLoadedState.set(true);
            this.finishInitialGlobalRecentLoadIfReady();
            return;
        }

        try {
            const recentItems = await this.dbService.getGlobalRecentlyViewed();
            let normalized = recentItems.map((item) =>
                mapDbRecentToItem(item)
            );
            normalized = await this.enrichDashboardItems(normalized);
            this.ngZone.run(() => this.xtreamGlobalRecentItems.set(normalized));
        } catch (err) {
            this.ngZone.run(() => this.xtreamGlobalRecentItems.set([]));
        } finally {
            this.globalRecentDbLoadedState.set(true);
            this.finishInitialGlobalRecentLoadIfReady();
        }
    }

    async reloadGlobalFavorites(): Promise<void> {
        if (!this.globalFavoritesLoaded()) {
            this.globalFavoritesLoadingState.set(true);
            this.xtreamGlobalFavoritesLoadedState.set(false);
            this.playlistBackedGlobalFavoritesLoadedState.set(false);
        }

        const xtreamReload = this.reloadXtreamGlobalFavorites().finally(() => {
            this.ngZone.run(() =>
                this.xtreamGlobalFavoritesLoadedState.set(true)
            );
            this.finishInitialGlobalFavoritesLoadIfReady();
        });
        const m3uReload = this.reloadPlaylistBackedGlobalFavorites();

        await Promise.all([xtreamReload, m3uReload]);
        if (
            this.playlistsLoaded() &&
            !this.playlistBackedGlobalFavoritesLoadedState()
        ) {
            await this.reloadPlaylistBackedGlobalFavorites();
        }
        this.finishInitialGlobalFavoritesLoadIfReady();
        this.favoritesAutoRefreshEnabled.set(true);
    }

    async getGlobalRecentlyAddedItems(
        kind: DashboardRecentlyAddedFilterKind,
        limit = 500
    ): Promise<DashboardRecentlyAddedItem[]> {
        if (!this.hasPortalActivityStorage) {
            return [];
        }

        const items = await this.dbService.getGlobalRecentlyAdded(kind, limit);
        let mapped = items.map((item) => mapDbRecentlyAddedToItem(item));
        mapped = await this.enrichDashboardItems(mapped);
        return mapped.sort((a, b) => toTimestamp(b.added_at) - toTimestamp(a.added_at));
    }

    async getXtreamRecentlyAddedItems(
        limit = 500
    ): Promise<DashboardRecentlyAddedItem[]> {
        if (!this.hasPortalActivityStorage) {
            return [];
        }

        const items = await this.dbService.getGlobalRecentlyAdded(
            'all',
            limit,
            'xtream'
        );
        let mapped = items.map((item) => mapDbRecentlyAddedToItem(item));
        mapped = await this.enrichDashboardItems(mapped);
        return mapped.sort((a, b) => toTimestamp(b.added_at) - toTimestamp(a.added_at));
    }

    async reloadXtreamRecentlyAddedItems(limit = 500): Promise<void> {
        if (!this.xtreamRecentlyAddedLoaded()) {
            this.xtreamRecentlyAddedLoadingState.set(true);
        }

        if (!this.hasPortalActivityStorage) {
            this.ngZone.run(() => {
                this.xtreamRecentlyAddedItemsState.set([]);
                this.xtreamRecentlyAddedLoadingState.set(false);
                this.xtreamRecentlyAddedLoadedState.set(true);
            });
            return;
        }

        try {
            let items = await this.getXtreamRecentlyAddedItems(limit);
            items = await this.enrichDashboardItems(items);
            this.ngZone.run(() =>
                this.xtreamRecentlyAddedItemsState.set(items)
            );
        } catch (err) {
            this.ngZone.run(() => this.xtreamRecentlyAddedItemsState.set([]));
        } finally {
            this.ngZone.run(() => {
                this.xtreamRecentlyAddedLoadingState.set(false);
                this.xtreamRecentlyAddedLoadedState.set(true);
            });
        }
    }

    private async reloadXtreamGlobalFavorites(): Promise<void> {
        if (!this.hasPortalActivityStorage) {
            let favorites = await this.loadPwaXtreamGlobalFavorites();
            favorites = await this.enrichDashboardItems(favorites);
            this.ngZone.run(() => this.xtreamGlobalFavorites.set(favorites));
            return;
        }

        try {
            const favorites = await this.dbService.getAllGlobalFavorites();
            let normalized = favorites.map((item) =>
                mapDbFavoriteToItem(item)
            );
            normalized = await this.enrichDashboardItems(normalized);
            this.ngZone.run(() => this.xtreamGlobalFavorites.set(normalized));
        } catch (err) {
            this.ngZone.run(() => this.xtreamGlobalFavorites.set([]));
        }
    }

    private async loadPwaXtreamGlobalRecentItems(): Promise<
        GlobalRecentItem[]
    > {
        const nested = await Promise.all(
            this.getXtreamPlaylists().map(async (playlist) => {
                const rows = await this.xtreamDataSource.getRecentItems(
                    playlist._id
                );
                return rows.map((item) =>
                    this.mapPwaXtreamRecentItem(item, playlist)
                );
            })
        );
        return nested.reduce<GlobalRecentItem[]>(
            (items, playlistItems) => items.concat(playlistItems),
            []
        );
    }

    private async loadPwaXtreamGlobalFavorites(): Promise<
        DashboardFavoriteItem[]
    > {
        const nested = await Promise.all(
            this.getXtreamPlaylists().map(async (playlist) => {
                const rows = await this.xtreamDataSource.getFavorites(
                    playlist._id
                );
                return rows.map((item) =>
                    this.mapPwaXtreamFavoriteItem(item, playlist)
                );
            })
        );
        return nested.reduce<DashboardFavoriteItem[]>(
            (items, playlistItems) => items.concat(playlistItems),
            []
        );
    }

    private getXtreamPlaylists(): PlaylistMeta[] {
        return this.playlists().filter(
            (playlist: any) => !!playlist.serverUrl && !playlist.macAddress
        );
    }

    private mapPwaXtreamRecentItem(
        item: XtreamContentItem,
        playlist: PlaylistMeta
    ): GlobalRecentItem {
        return {
            id: item.id,
            title: item.title,
            type: this.normalizeXtreamActivityType(item.type),
            playlist_id: playlist._id,
            playlist_name: playlist.title || 'Xtream',
            viewed_at: item.viewed_at ?? '',
            category_id: item.category_id,
            xtream_id: item.xtream_id,
            poster_url: item.poster_url,
            backdrop_url: item.backdrop_url ?? undefined,
            source: 'xtream',
        };
    }

    private mapPwaXtreamFavoriteItem(
        item: XtreamContentItem,
        playlist: PlaylistMeta
    ): DashboardFavoriteItem {
        return {
            id: item.id,
            title: item.title,
            type: this.normalizeXtreamActivityType(item.type),
            playlist_id: playlist._id,
            playlist_name: playlist.title || 'Xtream',
            added_at: item.added_at || item.added || new Date(0).toISOString(),
            category_id: item.category_id,
            xtream_id: item.xtream_id,
            poster_url: item.poster_url,
            backdrop_url: item.backdrop_url ?? undefined,
            source: 'xtream',
        };
    }

    private normalizeXtreamActivityType(type: string): PortalActivityType {
        if (type === 'live' || type === 'series') {
            return type;
        }
        return 'movie';
    }

    private async reloadPlaylistBackedGlobalFavorites(): Promise<void> {
        const loaded = await this.refreshPlaylistBackedGlobalFavorites();
        if (!loaded) {
            return;
        }

        this.ngZone.run(() =>
            this.playlistBackedGlobalFavoritesLoadedState.set(true)
        );
        this.finishInitialGlobalFavoritesLoadIfReady();
    }

    private async refreshPlaylistBackedGlobalFavorites(): Promise<boolean> {
        if (!this.playlistsLoaded()) {
            return false;
        }

        await this.reloadM3uGlobalFavorites();
        return true;
    }

    private async reloadM3uGlobalFavorites(): Promise<void> {
        const m3uPlaylists = this.playlists().filter(
            (playlist: any) =>
                !playlist.serverUrl &&
                !playlist.macAddress &&
                Array.isArray(playlist.favorites) &&
                playlist.favorites.some(
                    (favorite: any): favorite is string =>
                        typeof favorite === 'string' &&
                        favorite.trim().length > 0
                )
        );

        const validIds = new Set(m3uPlaylists.map((p) => p._id));

        this.ngZone.run(() => {
            this.m3uPlaylistFavoritesMap.update((prev) => {
                let next: Map<string, DashboardFavoriteItem[]> | null = null;
                for (const id of prev.keys()) {
                    if (!validIds.has(id)) {
                        next ??= new Map(prev);
                        next.delete(id);
                    }
                }
                return next ?? prev;
            });
        });
        for (const id of Array.from(this.m3uFavoritesCache.keys())) {
            if (!validIds.has(id)) {
                this.m3uFavoritesCache.delete(id);
            }
        }

        if (m3uPlaylists.length === 0) {
            return;
        }

        await Promise.all(
            m3uPlaylists.map(async (playlist) => {
                let items: DashboardFavoriteItem[];
                try {
                    items = await this.loadM3uPlaylistFavorites(playlist);
                } catch (err) {
                    items = [];
                }

                this.ngZone.run(() => {
                    this.m3uPlaylistFavoritesMap.update((prev) => {
                        const next = new Map(prev);
                        next.set(playlist._id, items);
                        return next;
                    });
                });
            })
        );
    }

    private finishInitialGlobalFavoritesLoadIfReady(): void {
        if (
            !this.playlistsLoaded() ||
            !this.xtreamGlobalFavoritesLoadedState() ||
            !this.playlistBackedGlobalFavoritesLoadedState()
        ) {
            return;
        }

        this.ngZone.run(() => {
            this.globalFavoritesLoadedState.set(true);
            this.globalFavoritesLoadingState.set(false);
        });
    }

    private finishInitialGlobalRecentLoadIfReady(): void {
        if (!this.playlistsLoaded() || !this.globalRecentDbLoadedState()) {
            return;
        }

        this.ngZone.run(() => {
            this.globalRecentLoadedState.set(true);
            this.globalRecentLoadingState.set(false);
        });
    }

    isTypeInKind(
        type: PortalActivityType,
        kind: DashboardContentKind
    ): boolean {
        return isTypeInKindUtil(type, kind);
    }

    getPlaylistLink(playlist: PlaylistMeta): string[] {
        return getPlaylistLinkUtil(playlist);
    }

    getPlaylistProvider(playlist: PlaylistMeta): string {
        this.languageTick();
        const pl = playlist as any;
        if (pl.serverUrl) {
            return this.translateText('WORKSPACE.DASHBOARD.XTREAM');
        }

        if (pl.macAddress) {
            return this.translateText('WORKSPACE.DASHBOARD.STALKER');
        }

        return this.translateText('WORKSPACE.DASHBOARD.M3U');
    }

    getRecentItemProviderLabel(item: GlobalRecentItem): string {
        this.languageTick();

        if (item.source === 'stalker') {
            return this.translateText('WORKSPACE.DASHBOARD.STALKER');
        }
        if (item.source === 'xtream') {
            return this.translateText('WORKSPACE.DASHBOARD.XTREAM');
        }
        if (item.source === 'm3u') {
            return this.translateText('WORKSPACE.DASHBOARD.M3U');
        }
        return this.translateText('WORKSPACE.DASHBOARD.PROVIDER');
    }

    getRecentItemTypeLabel(item: GlobalRecentItem): string {
        this.languageTick();
        return this.translateText(getActivityTypeLabelKey(item.type));
    }

    getRecentItemLink(item: GlobalRecentItem): string[] {
        return getRecentItemLinkUtil(item);
    }

    getRecentItemNavigationState(
        item: GlobalRecentItem
    ): WorkspaceNavigationTarget['state'] {
        return getRecentItemNavigationStateUtil(item);
    }

    async removeGlobalRecentItem(item: GlobalRecentItem): Promise<void> {
        if (item.source === 'xtream') {
            if (this.hasPortalActivityStorage) {
                await this.dbService.removeRecentItem(
                    item.id as number,
                    item.playlist_id
                );
            } else {
                await this.xtreamDataSource.removeRecentItem(
                    item.id as number,
                    item.playlist_id
                );
            }
            await this.reloadGlobalRecentItems();
            return;
        }

        if (item.source === 'stalker') {
            const updatedPlaylist = await firstValueFrom(
                this.playlistsService.removeFromPortalRecentlyViewed(
                    item.playlist_id,
                    item.id
                )
            );

            this.store.dispatch(
                PlaylistActions.updatePlaylistMeta({
                    playlist: {
                        _id: item.playlist_id,
                        recentlyViewed: updatedPlaylist?.recentlyViewed ?? [],
                    } as unknown as PlaylistMeta,
                }) as any
            );
            return;
        }

        if (item.source === 'm3u') {
            const updatedPlaylist = await firstValueFrom(
                this.playlistsService.removeFromM3uRecentlyViewed(
                    item.playlist_id,
                    String(item.xtream_id ?? item.id)
                )
            );

            this.store.dispatch(
                PlaylistActions.updatePlaylistMeta({
                    playlist: {
                        _id: item.playlist_id,
                        recentlyViewed: updatedPlaylist?.recentlyViewed ?? [],
                    } as unknown as PlaylistMeta,
                }) as any
            );
        }
    }

    getFavoriteItemProviderLabel(item: DashboardFavoriteItem): string {
        return this.getActivityItemProviderLabel(item);
    }

    getRecentlyAddedItemProviderLabel(
        item: DashboardRecentlyAddedItem
    ): string {
        return this.getActivityItemProviderLabel(item);
    }

    private getActivityItemProviderLabel(
        item: Pick<PortalActivityItem, 'source'>
    ): string {
        this.languageTick();

        if (item.source === 'stalker') {
            return this.translateText('WORKSPACE.DASHBOARD.STALKER');
        }
        if (item.source === 'xtream') {
            return this.translateText('WORKSPACE.DASHBOARD.XTREAM');
        }
        if (item.source === 'm3u') {
            return this.translateText('WORKSPACE.DASHBOARD.M3U');
        }
        return this.translateText('WORKSPACE.DASHBOARD.PROVIDER');
    }

    getFavoriteItemTypeLabel(item: DashboardFavoriteItem): string {
        return this.getActivityItemTypeLabel(item);
    }

    getRecentlyAddedItemTypeLabel(item: DashboardRecentlyAddedItem): string {
        return this.getActivityItemTypeLabel(item);
    }

    private getActivityItemTypeLabel(
        item: Pick<PortalActivityItem, 'type'>
    ): string {
        this.languageTick();
        return this.translateText(getActivityTypeLabelKey(item.type));
    }

    getGlobalFavoriteLink(item: DashboardFavoriteItem): string[] {
        return getGlobalFavoriteLinkUtil(item);
    }

    getGlobalFavoriteNavigationState(
        item: DashboardFavoriteItem
    ): WorkspaceNavigationTarget['state'] {
        return getGlobalFavoriteNavigationStateUtil(item);
    }

    getRecentlyAddedLink(item: DashboardRecentlyAddedItem): string[] {
        return getRecentlyAddedLinkUtil(item);
    }

    getRecentlyAddedNavigationState(
        item: DashboardRecentlyAddedItem
    ): WorkspaceNavigationTarget['state'] {
        return getRecentlyAddedNavigationStateUtil(item);
    }

    async removeGlobalFavorite(item: DashboardFavoriteItem): Promise<void> {
        if (item.source === 'xtream') {
            if (this.panelSync && item.xtream_id != null) {
                try {
                    const meta = this.playlists().find((p: any) => p._id === item.playlist_id);
                    const metaAny = meta as any;
                    if (metaAny?.serverUrl) {
                        const fbType = item.type === 'movie' ? 'Movie' : item.type === 'series' ? 'Series' : 'LiveTv';
                        const userIdObj = { username: metaAny.username, password: metaAny.password, server: metaAny.serverUrl };
                        await (this.panelSync as any).removeFavorite(userIdObj, fbType, item.xtream_id);
                    }
                } catch { /* best effort */ }
            }

            if (this.hasPortalActivityStorage) {
                await this.dbService.removeFromFavorites(
                    item.id as number,
                    item.playlist_id
                );
            } else {
                await this.xtreamDataSource.removeFavorite(
                    item.id as number,
                    item.playlist_id
                );
            }
            await this.reloadGlobalFavorites();
            return;
        }

        if (item.source === 'stalker') {
            const playlist = this.playlists().find(
                (p) => p._id === item.playlist_id
            );
            if (!playlist) return;

            const currentFavorites = Array.isArray(playlist.favorites)
                ? [...playlist.favorites]
                : [];
            const itemMatchStr = String(item.id);

            const filteredFavorites = currentFavorites.filter(
                (raw, index) =>
                    !stalkerItemMatchesId(
                        raw,
                        itemMatchStr,
                        playlist._id,
                        index
                    )
            );

            this.store.dispatch(
                PlaylistActions.updatePlaylistMeta({
                    playlist: {
                        _id: item.playlist_id,
                        favorites: filteredFavorites,
                    } as unknown as PlaylistMeta,
                }) as any
            );
        }

        if (item.source === 'm3u') {
            const playlist = await firstValueFrom(
                this.playlistsService.getPlaylistById(item.playlist_id)
            );
            const currentFavorites = Array.isArray(playlist?.favorites)
                ? playlist.favorites.filter(
                      (favorite: any): favorite is string =>
                          typeof favorite === 'string'
                  )
                : [];
            const filteredFavorites = currentFavorites.filter(
                (favorite: any) => favorite !== String(item.id)
            );

            await firstValueFrom(
                this.playlistsService.setFavorites(
                    item.playlist_id,
                    filteredFavorites
                )
            );
            await this.reloadGlobalFavorites();
        }
    }

    formatTimestamp(value?: string | number): string {
        this.languageTick();

        const timestamp = toTimestamp(value);
        if (!timestamp) {
            return this.translateText('WORKSPACE.DASHBOARD.NOT_YET_SYNCED');
        }

        return new Date(timestamp).toLocaleString(this.getLocale());
    }

    private async loadM3uPlaylistFavorites(
        playlistMeta: PlaylistMeta
    ): Promise<DashboardFavoriteItem[]> {
        const fingerprint = this.buildM3uFavoritesFingerprint(playlistMeta);
        const cached = this.m3uFavoritesCache.get(playlistMeta._id);
        if (cached && cached.fingerprint === fingerprint) {
            return cached.items;
        }

        const fastPathItems =
            await this.loadM3uPlaylistFavoritesFromResolvedChannels(
                playlistMeta,
                fingerprint
            );
        if (fastPathItems !== null) {
            return fastPathItems;
        }

        const playlist = (await firstValueFrom(
            this.playlistsService.getPlaylistById(playlistMeta._id)
        )) as Playlist & {
            playlist?: {
                items?: Channel[];
            };
        };
        const favorites = Array.isArray(playlist?.favorites)
            ? playlist.favorites.filter(
                  (favorite: any): favorite is string =>
                      typeof favorite === 'string' && favorite.trim().length > 0
              )
            : [];

        if (favorites.length === 0) {
            this.m3uFavoritesCache.set(playlistMeta._id, {
                fingerprint,
                items: [],
            });
            return [];
        }

        const items: Channel[] = Array.isArray(playlist?.playlist?.items)
            ? (playlist.playlist.items as Channel[])
            : [];
        const fallbackTimestamp =
            this.getM3uFavoriteTimestamp(playlistMeta) ??
            new Date(0).toISOString();
        const favoritePositions = new Map<string, number>();

        favorites.forEach((favorite: any, index: number) => {
            if (!favoritePositions.has(favorite)) {
                favoritePositions.set(favorite, index);
            }
        });

        const computedItems = items.reduce<DashboardFavoriteItem[]>(
            (acc, channel) => {
                const channelId = String(channel.id ?? '').trim();
                const channelUrl = String(channel.url ?? '').trim();
                const channelIdFavoritePosition =
                    favoritePositions.get(channelId);
                const channelUrlFavoritePosition =
                    favoritePositions.get(channelUrl);
                const matchedFavoriteId =
                    channelIdFavoritePosition !== undefined &&
                    (channelUrlFavoritePosition === undefined ||
                        channelIdFavoritePosition <= channelUrlFavoritePosition)
                        ? channelId
                        : channelUrlFavoritePosition !== undefined
                          ? channelUrl
                          : null;

                if (!matchedFavoriteId) {
                    return acc;
                }

                acc.push(
                    this.createM3uFavoriteItem(
                        playlistMeta,
                        matchedFavoriteId,
                        channel,
                        fallbackTimestamp
                    )
                );
                return acc;
            },
            []
        );

        this.m3uFavoritesCache.set(playlistMeta._id, {
            fingerprint,
            items: computedItems,
        });
        return computedItems;
    }

    private async loadM3uPlaylistFavoritesFromResolvedChannels(
        playlistMeta: PlaylistMeta,
        fingerprint: string
    ): Promise<DashboardFavoriteItem[] | null> {
        let resolvedChannels: M3uFavoriteChannel[] | null;
        try {
            resolvedChannels = await firstValueFrom(
                this.playlistsService.getM3uFavoriteChannels(playlistMeta._id)
            );
        } catch (err) {
            return null;
        }

        if (resolvedChannels === null) {
            return null;
        }

        const fallbackTimestamp =
            this.getM3uFavoriteTimestamp(playlistMeta) ??
            new Date(0).toISOString();
        const items = resolvedChannels.slice().map((favorite: any) =>
            this.createM3uFavoriteItem(
                playlistMeta,
                favorite.favoriteId,
                favorite.channel,
                fallbackTimestamp
            )
        );

        this.m3uFavoritesCache.set(playlistMeta._id, {
            fingerprint,
            items,
        });
        return items;
    }

    private createM3uFavoriteItem(
        playlistMeta: PlaylistMeta,
        favoriteId: string,
        channel: Channel,
        fallbackTimestamp: string
    ): DashboardFavoriteItem {
        const channelId = String(channel.id ?? '').trim();

        return {
            id: favoriteId,
            title:
                channel.name?.trim() ||
                channel.tvg?.name?.trim() ||
                channelId ||
                favoriteId,
            type: 'live',
            playlist_id: playlistMeta._id,
            playlist_name: playlistMeta.title || playlistMeta.filename || 'M3U',
            added_at: fallbackTimestamp,
            category_id: 'live',
            xtream_id: favoriteId,
            poster_url: channel.tvg?.logo || undefined,
            epg_lookup_key:
                channel.tvg?.id?.trim() ||
                channel.tvg?.name?.trim() ||
                channel.name?.trim() ||
                undefined,
            source: 'm3u',
        };
    }

    private buildM3uFavoritesFingerprint(playlist: PlaylistMeta): string {
        const favoritesPart = JSON.stringify(playlist.favorites ?? []);
        const updatePart = String(
            playlist.updateDate ?? playlist.importDate ?? ''
        );
        return `${updatePart}::${favoritesPart}`;
    }

    private getM3uFavoriteTimestamp(playlist: PlaylistMeta): string | null {
        if (playlist.updateDate) {
            return new Date(playlist.updateDate).toISOString();
        }

        return typeof playlist.importDate === 'string'
            ? playlist.importDate
            : null;
    }

    private getPlaylistActivityTimestamp(item: PlaylistMeta): number {
        return this.recentPlaylistActivityTimestamps().get(item._id) ?? 0;
    }

    private getRecentTimestamp(item: PlaylistMeta): number {
        return toTimestamp(item.updateDate) || toTimestamp(item.importDate);
    }

    private getLocale(): string | undefined {
        return (
            this.translate.currentLang ||
            this.translate.defaultLang ||
            undefined
        );
    }

    private translateText(
        key: string,
        params?: Record<string, string | number>
    ): string {
        return this.translate.instant(key, params);
    }
}