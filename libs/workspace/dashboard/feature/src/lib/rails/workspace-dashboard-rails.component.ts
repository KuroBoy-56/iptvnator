import {
    ChangeDetectionStrategy,
    Component,
    computed,
    effect,
    inject,
    signal,
    untracked,
} from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { interval, of, startWith, switchMap } from 'rxjs';
import { EpgService } from '@iptvnator/epg/data-access';
import { type EpgProgram, normalizeDashboardRailsSettings } from '@iptvnator/shared/interfaces';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatIcon } from '@angular/material/icon';
import { MatSnackBar } from '@angular/material/snack-bar';
import { RouterLink, ActivatedRoute } from '@angular/router';
import { Store } from '@ngrx/store';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { EmptyStateComponent, PlaylistInfoComponent, PlaylistRefreshActionService } from '@iptvnator/playlist/shared/ui';
import { WORKSPACE_SHELL_ACTIONS, WorkspacePlaylistType } from '@iptvnator/workspace/shell/util';
import { DialogService } from '@iptvnator/ui/components';
import { PlaylistActions } from '@iptvnator/m3u-state';
import { PlaylistDeleteActionService, RuntimeCapabilitiesService, SettingsStore } from '@iptvnator/services';
import { DashboardDataService, DashboardFavoriteItem, DashboardRecentlyAddedItem, DashboardTrendingItem, DashboardTrendingService, GlobalRecentItem } from '@iptvnator/workspace/dashboard/data-access';
import type { DashboardHeroTmdbExtras } from './dashboard-hero-tmdb.service';
import { DashboardHeroTmdbService } from './dashboard-hero-tmdb.service';
import { DashboardRailComponent } from './dashboard-rail.component';
import type { DashboardRailCard, DashboardRailActionSelection } from './dashboard-rail.component';
import type { PlaylistMeta } from '@iptvnator/shared/interfaces';
import type { DashboardHeroModel } from './dashboard-hero.utils';
import { resolveDashboardHeroArtwork } from './dashboard-hero.utils';
import { buildDashboardLiveEpgDetails, buildLiveEpgCardsForEnabledRails, buildLiveEpgLookupKeys, getLiveEpgProgramForCard, LIVE_EPG_TICK_MS } from './dashboard-live-epg.utils';
import type { DashboardLiveEpgDetails } from './dashboard-live-epg.utils';
import { buildPlaybackPositionReloadKey, formatRemainingLabel, isContinueWatchingRecentItem } from './dashboard-playback.utils';
import { buildDashboardCollectionViewState, buildDashboardRailSeeAllState, buildDashboardSourceActions, isXtreamAccountPlaylist, liveRailTitleKeyForSource, RAIL_ITEM_LIMIT, shouldShowLiveFavoritesSkeleton, shouldShowRecentContentSkeleton, SKELETON_CARDS_PER_RAIL, SKELETON_RAILS } from './dashboard-rail.utils';
import type { DashboardSourceActionId } from './dashboard-rail.utils';
import { PlaylistContextFacade } from '@iptvnator/playlist/shared/util';

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

const dashboardPostersCache = new Map<string, { title: string, poster_url: string, backdrop_url: string }>();

@Component({
    selector: 'lib-workspace-dashboard-rails',
    imports: [DashboardRailComponent, EmptyStateComponent, MatButtonModule, MatIcon, RouterLink, TranslatePipe],
    templateUrl: './workspace-dashboard-rails.component.html',
    styleUrl: './workspace-dashboard-rails.component.scss',
    changeDetection: ChangeDetectionStrategy.OnPush,
    host: { '[class.rails-page-host--empty]': 'ready() && !hasPlaylists()' },
})
export class WorkspaceDashboardRailsComponent {
    readonly data = inject(DashboardDataService);
    private readonly dialog = inject(MatDialog);
    private readonly dialogService = inject(DialogService);
    private readonly playlistDeleteAction = inject(PlaylistDeleteActionService);
    private readonly playlistRefreshAction = inject(PlaylistRefreshActionService);
    private readonly snackBar = inject(MatSnackBar);
    private readonly store = inject(Store);
    private readonly translate = inject(TranslateService);
    private readonly route = inject(ActivatedRoute);
    private readonly languageTick = toSignal(this.translate.onLangChange.pipe(startWith(null)), { initialValue: null });
    private readonly shellActions = inject(WORKSPACE_SHELL_ACTIONS);
    private readonly epgService = inject(EpgService);
    private readonly runtime = inject(RuntimeCapabilitiesService);
    private readonly settingsStore = inject(SettingsStore);
    private readonly heroTmdb = inject(DashboardHeroTmdbService);
    private readonly playlistContext = inject(PlaylistContextFacade);
    readonly trendingService = inject(DashboardTrendingService);

    readonly hasPlaylists = computed(() => this.data.playlists().length > 0);
    readonly ready = this.data.dashboardReady;
    readonly xtreamPlaylistCount = this.data.xtreamPlaylistCount;
    readonly isElectron = this.runtime.isElectron;
    readonly skeletonSlots = SKELETON_CARDS_PER_RAIL;
    readonly skeletonRails = SKELETON_RAILS;
    readonly liveRailTitleKeyForSource = liveRailTitleKeyForSource;
    readonly failedHeroImages = signal<Record<string, true>>({});
    readonly dashboardRails = computed(() => normalizeDashboardRailsSettings(this.settingsStore.dashboardRails?.()));

    private readonly cacheTrigger = signal(0);

    private getActivePlaylistId(): string {
        const ctxId = this.playlistContext.resolvedPlaylistId();
        if (ctxId) return ctxId;
        try {
            const url = window.location.href;
            const match = url.match(/(?:playlists|xtreams)\/([a-zA-Z0-9-]+)/);
            if (match && match[1]) return match[1];
        } catch(e) {}
        try {
            const sessionServer = localStorage.getItem('session_server');
            const sessionUser = localStorage.getItem('session_user');
            if (sessionServer && sessionUser) {
                const match = this.data.playlists().find((p: any) => p.serverUrl === sessionServer && p.username === sessionUser);
                if (match) return match._id;
            }
        } catch(e) {}
        return this.data.playlists()[0]?._id || 'none';
    }

    private isValidItem(item: any): boolean {
        let title = item.title || item.name;
        if (!title || title.trim() === '' || title === 'null') return false;
        if (/^Contenido \d+$/.test(title.trim())) return false;
        return true;
    }

    private getWatchProgress(position: any): number {
        if (position && position.durationSeconds > 0 && position.positionSeconds > 0) {
            let progress = (position.positionSeconds / position.durationSeconds) * 100;
            return Math.min(Math.max(Math.round(progress), 0), 100);
        }
        return 0;
    }

    constructor() {
        void this.data.reloadGlobalRecentItems();
        void this.data.reloadGlobalFavorites();

        effect(() => {
            const activeId = this.getActivePlaylistId();
            
            // LA MAGIA ESTÁ AQUÍ: Ahora toma los Recientes Y LOS FAVORITOS en vivo
            const rawRecent = this.data.globalRecentItems().filter(item => item.playlist_id === activeId && this.isValidItem(item));
            const rawFavLive = this.data.globalFavoriteLiveItems().filter(item => item.playlist_id === activeId && this.isValidItem(item));
            const rawFavVOD = this.data.globalFavoriteItems().filter(item => item.playlist_id === activeId && this.isValidItem(item));
            
            const win = window as any;
            const ipc = win.electron?.ipcRenderer;

            const enrich = () => {
                const allItems = [...rawRecent, ...rawFavLive, ...rawFavVOD];
                
                allItems.forEach(async (item) => {
                    if (item.source === 'xtream' && item.xtream_id) {
                        const cacheKey = `${item.playlist_id}:${item.xtream_id}:${item.type}`;
                        if (dashboardPostersCache.has(cacheKey)) return;

                        let titleStr = String(item.title || '');
                        let tLower = titleStr.toLowerCase();
                        let isGeneric = !item.title || tLower === 'contenido' || tLower === 'favorito' || tLower === 'null' || tLower.includes('película') || tLower.includes('pelicula') || tLower.includes('serie') || tLower.includes('canal');
                        let noPoster = !item.poster_url && !item.backdrop_url;

                        // CANALES EN VIVO (Favoritos y Recientes van directo a la RAM)
                        if (item.type === 'live' ) {
                            const liveMap = win.__liveChannelsCache?.[item.playlist_id];
                            if (liveMap) {
                                const liveInfo = liveMap.get(String(item.xtream_id));
                                if (liveInfo) {
                                    dashboardPostersCache.set(cacheKey, { 
                                        title: liveInfo.name, 
                                        poster_url: liveInfo.logo, 
                                        backdrop_url: liveInfo.logo 
                                    });
                                    this.cacheTrigger.update(v => v + 1);
                                }
                            }
                            return; // Terminamos aquí con la TV en vivo
                        }

                        // PELÍCULAS Y SERIES
                        if (isGeneric || noPoster) {
                            let updated = false;
                            let newTitle = item.title;
                            let newPoster = item.poster_url;
                            let newBackdrop = item.backdrop_url;

                            const pl = this.data.playlists().find((p: any) => p._id === item.playlist_id) as any;

                            if (ipc) {
                                try {
                                    const cType = item.type === 'series' ? 'series' : 'movie';
                                    const content = await ipc.invoke('DB_GET_CONTENT_BY_XTREAM_ID', {
                                        xtreamId: Number(item.xtream_id),
                                        playlistId: item.playlist_id,
                                        contentType: cType
                                    });
                                    const realContent = Array.isArray(content) ? content[0] : content;
                                    if (realContent) {
                                        if (isGeneric && realContent.title) { newTitle = realContent.title; isGeneric = false; updated = true; }
                                        if (noPoster && (realContent.poster_url || realContent.backdrop_url || realContent.logo)) {
                                            newPoster = realContent.poster_url || realContent.backdrop_url || realContent.logo;
                                            newBackdrop = newPoster;
                                            noPoster = false;
                                            updated = true;
                                        }
                                    }
                                } catch(e) {}
                            }

                            if ((isGeneric || noPoster) && pl && pl.serverUrl) {
                                try {
                                    const baseUrl = pl.serverUrl.trim().replace(/\/+$/, '');
                                    const action = item.type === 'series' ? 'get_series_info&series_id=' : 'get_vod_info&vod_id=';
                                    const url = `${baseUrl}/player_api.php?username=${pl.username}&password=${pl.password}&action=${action}${item.xtream_id}`;
                                    const resp = await safeFetchJson(url);
                                    if (resp) {
                                        if (item.type === 'series' && resp.info) {
                                            if (isGeneric && resp.info.name) { newTitle = resp.info.name; updated = true; }
                                            if (noPoster && (resp.info.cover || resp.info.backdrop_path?.[0])) { newPoster = resp.info.cover || resp.info.backdrop_path?.[0]; updated = true; }
                                        } else if (resp.movie_data || resp.info) {
                                            if (isGeneric && (resp.movie_data?.name || resp.info?.name || resp.info?.movie_name)) { newTitle = resp.movie_data?.name || resp.info?.name || resp.info?.movie_name; updated = true; }
                                            if (noPoster && (resp.movie_data?.poster || resp.info?.movie_image || resp.info?.cover)) { newPoster = resp.movie_data?.poster || resp.info?.movie_image || resp.info?.cover; updated = true; }
                                        }
                                        newBackdrop = newPoster;
                                    }
                                } catch(e) {}
                            }

                            if (updated) {
                                dashboardPostersCache.set(cacheKey, { 
                                    title: newTitle || '', 
                                    poster_url: newPoster || '', 
                                    backdrop_url: newBackdrop || '' 
                                });
                                this.cacheTrigger.update(v => v + 1);
                            }
                        }
                    }
                });
            };

            untracked(() => { enrich(); });
        });

        effect(() => {
            if (this.xtreamPlaylistCount() === 0 || !this.data.globalFavoritesLoaded()) return;
            void this.data.reloadXtreamRecentlyAddedItems(500); 
        });

        effect(() => {
            this.playbackPositionReloadKey();
            untracked(() => void this.data.reloadPlaybackPositions());
        });

        effect(() => {
            const item = this.heroRecentItem();
            if (!item || (item.type !== 'movie' && item.type !== 'series')) return;
            const key = this.heroTmdbKey(item);
            untracked(() => {
                if (this.heroTmdbExtras()?.key === key) return;
                void this.heroTmdb.getExtras(item).then((extras) => {
                    const current = untracked(() => this.heroRecentItem());
                    if (current && this.heroTmdbKey(current) === key) this.heroTmdbExtras.set({ key, extras });
                });
            });
        });

        effect(() => {
            if (!this.dashboardRails().tmdbTrending || !this.data.globalFavoritesLoaded()) return;
            untracked(() => void this.trendingService.load());
        });
    }

    readonly mergedRecentItems = computed<GlobalRecentItem[]>(() => {
        this.cacheTrigger(); // Reacciona cada vez que el caché carga una carátula nueva
        return this.data.globalRecentItems().filter(item => item.playlist_id === this.getActivePlaylistId() && this.isValidItem(item));
    });

    private readonly heroRecentItem = computed(() => this.mergedRecentItems()[0] ?? null);
    private readonly heroTmdbExtras = signal<{ key: string; extras: DashboardHeroTmdbExtras | null; } | null>(null);
    private readonly heroLiveCard = computed<DashboardRailCard | null>(() => {
        const item = this.heroRecentItem();
        return item?.type === 'live' ? this.toRecentCard(item) : null;
    });

    readonly hero = computed<DashboardHeroModel | null>(() => {
        const item = this.heroRecentItem();
        if (!item) return null;
        const extrasState = this.heroTmdbExtras();
        const extras = this.heroTmdb.isEnabled() && extrasState?.key === this.heroTmdbKey(item) ? extrasState.extras : null;
        const artwork = resolveDashboardHeroArtwork({ backdropUrl: item.backdrop_url || (extras?.backdropUrl ?? null) || '', posterUrl: item.poster_url || '', title: item.title }, this.failedHeroImages());
        const position = this.data.getPlaybackPositionForItem(item);
        const liveEpgDetails = item.type === 'live' ? this.getLiveEpgDetailsForCard(this.heroLiveCard()) : null;
        const episodeBadge = item.type === 'series' && position?.seasonNumber != null && position?.episodeNumber != null ? this.translate.instant('WORKSPACE.DASHBOARD.SEASON_EPISODE_BADGE', { season: position.seasonNumber, episode: position.episodeNumber }) : null;

        return {
            ...artwork, contentType: item.type, icon: this.typeIcon(item.type), link: this.data.getRecentItemLink(item), state: this.data.getRecentItemNavigationState(item), subtitle: this.buildHeroSubtitle(item), title: item.title, rating: extras?.rating ?? null, genres: extras?.genres ?? [], episodeBadge,
            watchProgress: item.type === 'live' ? null : this.getWatchProgress(position),
            remainingLabel: item.type === 'live' ? null : formatRemainingLabel(position),
            nowPlayingTitle: liveEpgDetails?.nowPlayingTitle ?? null,
            nowPlayingTimeRange: liveEpgDetails?.nowPlayingTimeRange ?? null,
            nowPlayingProgress: liveEpgDetails?.nowPlayingProgress ?? null,
        };
    });

    readonly continueWatchingBaseCards = computed<DashboardRailCard[]>(() => {
        this.languageTick();
        this.cacheTrigger(); // Reacciona al caché nuevo
        return this.mergedRecentItems()
            .filter(isContinueWatchingRecentItem)
            .slice(0, 20)
            .map((item) => this.toRecentCard(item));
    });

    readonly continueWatchingCards = computed<DashboardRailCard[]>(() => this.continueWatchingBaseCards());

    readonly liveFavoriteCards = computed<DashboardRailCard[]>(() => {
        this.cacheTrigger(); // Reacciona al caché de TV en Vivo
        const activeId = this.getActivePlaylistId();
        return this.data.globalFavoriteLiveItems()
            .filter(item => item.playlist_id === activeId && this.isValidItem(item))
            .slice(0, 20)
            .map((item) => this.toFavoriteCard(item));
    });

    readonly recentLiveCards = computed<DashboardRailCard[]>(() => {
        this.cacheTrigger(); // Reacciona al caché de TV en Vivo
        const activeId = this.getActivePlaylistId();
        return this.data.globalRecentLiveItems()
            .filter(item => item.playlist_id === activeId && this.isValidItem(item))
            .slice(0, 20)
            .map((item) => this.toRecentCard(item));
    });

    readonly showLiveFavoritesSkeleton = computed(() => shouldShowLiveFavoritesSkeleton(this.dashboardRails(), { globalFavoritesLoading: this.data.globalFavoritesLoading() }));
    readonly showRecentContentSkeleton = computed(() => shouldShowRecentContentSkeleton(this.dashboardRails(), { continueWatchingCount: this.continueWatchingCards().length, globalRecentLoading: this.data.globalRecentLoading(), recentLiveCount: this.recentLiveCards().length }));

    private readonly liveChannelLookupKeys = computed(() => {
        const heroLiveCard = this.heroLiveCard();
        return buildLiveEpgLookupKeys(buildLiveEpgCardsForEnabledRails(this.dashboardRails(), heroLiveCard, this.liveFavoriteCards(), this.recentLiveCards()));
    });

    private readonly playbackPositionReloadKey = computed(() => buildPlaybackPositionReloadKey(this.data.globalRecentVodItems()));

    private readonly liveEpgPrograms = toSignal(
        toObservable(this.liveChannelLookupKeys).pipe(
            switchMap((keys) => keys.length === 0 ? of(new Map<string, EpgProgram | null>()) : interval(LIVE_EPG_TICK_MS).pipe(startWith(0), switchMap(() => this.epgService.getCurrentProgramsForChannels(keys))))
        ), { initialValue: new Map<string, EpgProgram | null>() }
    );

    readonly liveFavoriteCardsEnriched = computed<DashboardRailCard[]>(() => this.enrichLiveCards(this.liveFavoriteCards()));
    readonly recentLiveCardsEnriched = computed<DashboardRailCard[]>(() => this.enrichLiveCards(this.recentLiveCards()));

    readonly favoriteMoviesAndSeriesCards = computed<DashboardRailCard[]>(() => {
        this.cacheTrigger(); // Reacciona al caché de Favoritos VOD/Series
        const activeId = this.getActivePlaylistId();
        return this.data.globalFavoriteItems()
            .filter((item) => item.playlist_id === activeId && (item.type === 'movie' || item.type === 'series') && this.isValidItem(item))
            .slice(0, 20)
            .map((item) => this.toFavoriteCard(item));
    });

    readonly continueWatchingSeeAllState = computed(() => buildDashboardRailSeeAllState(this.continueWatchingBaseCards()));
    readonly favoriteMoviesAndSeriesSeeAllState = computed(() => this.buildNonLiveSeeAllState(this.favoriteMoviesAndSeriesCards()));
    readonly liveSeeAllState = buildDashboardCollectionViewState('live');

    readonly xtreamRecentlyAddedCards = computed<DashboardRailCard[]>(() => {
        this.cacheTrigger();
        const activeId = this.getActivePlaylistId();
        return this.data.xtreamRecentlyAddedItems()
            .filter(item => item.playlist_id === activeId && this.isValidItem(item))
            .slice(0, 20)
            .map((item) => this.toRecentlyAddedCard(item));
    });

    readonly trendingCards = computed<DashboardRailCard[]>(() => {
        this.languageTick();
        if (!this.trendingService.isAvailable) return [];
        return this.trendingService.items().map((item) => this.toTrendingCard(item));
    });

    readonly sourceCards = computed<DashboardRailCard[]>(() =>
        this.data.recentPlaylists().map((playlist) => ({
            id: playlist._id,
            title: playlist.title || playlist.filename || this.t('WORKSPACE.DASHBOARD.UNTITLED_SOURCE'),
            subtitle: this.data.getPlaylistProvider(playlist),
            icon: playlist.serverUrl ? 'cloud' : playlist.macAddress ? 'cast' : 'folder_open',
            link: this.data.getPlaylistLink(playlist),
            actions: buildDashboardSourceActions(playlist, this.playlistRefreshAction.canRefresh(playlist)),
        }))
    );

    onAddPlaylist(type?: WorkspacePlaylistType): void { this.shellActions.openAddPlaylistDialog(type); }
    markHeroImageFailed(url: string): void { this.failedHeroImages.update((state) => state[url] ? state : { ...state, [url]: true }); }

    onSourceActionSelected(selection: DashboardRailActionSelection): void {
        const playlist = this.data.playlists().find((item) => item._id === selection.card.id);
        if (!playlist) return;
        switch (selection.action.id as DashboardSourceActionId) {
            case 'refresh': this.playlistRefreshAction.refresh(playlist); break;
            case 'playlist-info': this.dialog.open(PlaylistInfoComponent, { data: playlist }); break;
            case 'account-info': this.openXtreamAccountInfo(playlist); break;
            case 'remove': this.confirmRemovePlaylist(playlist); break;
        }
    }

    private enrichLiveCards(cards: readonly DashboardRailCard[]): DashboardRailCard[] {
        return cards.map((card) => {
            const details = this.getLiveEpgDetailsForCard(card);
            if (!details) return card;
            return { ...card, ...details };
        });
    }

    private getLiveEpgDetailsForCard(card: DashboardRailCard | null): DashboardLiveEpgDetails | null {
        if (!card) return null;
        const program = getLiveEpgProgramForCard(card, this.liveEpgPrograms());
        return buildDashboardLiveEpgDetails(program, Date.now());
    }

    private buildNonLiveSeeAllState(cards: readonly DashboardRailCard[]): Record<string, unknown> {
        return buildDashboardCollectionViewState(cards.some((card) => card.contentType === 'movie') ? 'movie' : 'series');
    }

    private buildHeroSubtitle(item: GlobalRecentItem): string {
        const parts = [item.playlist_name, this.data.getRecentItemProviderLabel(item), this.data.getRecentItemTypeLabel(item)].filter((value): value is string => Boolean(value));
        return parts.join(' · ');
    }

    private toRecentCard(item: GlobalRecentItem): DashboardRailCard {
        const position = this.data.getPlaybackPositionForItem(item);
        const watchProgress = this.getWatchProgress(position);
        const episodeBadge = item.type === 'series' && position?.seasonNumber != null && position?.episodeNumber != null ? this.translate.instant('WORKSPACE.DASHBOARD.SEASON_EPISODE_BADGE', { season: position.seasonNumber, episode: position.episodeNumber }) : null;
        
        const cacheKey = `${item.playlist_id}:${item.xtream_id}:${item.type}`;
        const cached = dashboardPostersCache.get(cacheKey);
        
        return {
            id: `recent-${item.id}-${item.playlist_id}-${item.viewed_at}`,
            title: cached?.title || item.title,
            subtitle: `${this.data.getRecentItemProviderLabel(item)} · ${this.data.getRecentItemTypeLabel(item)}`,
            imageUrl: cached?.poster_url || item.poster_url,
            icon: this.typeIcon(item.type),
            contentType: item.type,
            epgLookupKey: item.epg_lookup_key,
            link: this.data.getRecentItemLink(item),
            state: this.data.getRecentItemNavigationState(item),
            watchProgress,
            episodeBadge,
        };
    }

    private toFavoriteCard(item: DashboardFavoriteItem): DashboardRailCard {
        const cacheKey = `${item.playlist_id}:${item.xtream_id}:${item.type}`;
        const cached = dashboardPostersCache.get(cacheKey);
        
        return {
            id: `fav-${item.id}-${item.playlist_id}-${item.added_at}`,
            title: cached?.title || item.title,
            subtitle: `${this.data.getFavoriteItemProviderLabel(item)} · ${this.data.getFavoriteItemTypeLabel(item)}`,
            imageUrl: cached?.poster_url || item.poster_url,
            icon: this.typeIcon(item.type),
            contentType: item.type,
            epgLookupKey: item.epg_lookup_key,
            link: this.data.getGlobalFavoriteLink(item),
            state: this.data.getGlobalFavoriteNavigationState(item),
        };
    }

    private toRecentlyAddedCard(item: DashboardRecentlyAddedItem): DashboardRailCard {
        const typeLabel = this.data.getRecentlyAddedItemTypeLabel(item);
        const subtitleParts = [item.playlist_name, typeLabel].filter((value): value is string => Boolean(value));
        return {
            id: `added-${item.id}-${item.playlist_id}-${item.added_at}`,
            title: item.title,
            subtitle: subtitleParts.join(' · '),
            imageUrl: item.poster_url,
            icon: this.typeIcon(item.type),
            contentType: item.type,
            link: this.data.getRecentlyAddedLink(item),
            state: this.data.getRecentlyAddedNavigationState(item),
        };
    }

    private heroTmdbKey(item: GlobalRecentItem): string { return `${item.type}:${item.title}`; }

    private toTrendingCard(item: DashboardTrendingItem): DashboardRailCard {
        const subtitle = [item.year !== null ? String(item.year) : null, item.rating ? `★ ${item.rating}` : null, item.match?.playlistName ?? null].filter((value): value is string => Boolean(value)).join(' · ');
        return {
            id: `trending-${item.mediaType}-${item.tmdbId}`,
            title: item.title,
            subtitle,
            imageUrl: item.posterUrl ?? undefined,
            icon: item.mediaType === 'movie' ? 'movie' : 'video_library',
            contentType: item.mediaType === 'movie' ? 'movie' : 'series',
            link: item.match ? ['/workspace/xtreams', item.match.playlistId, item.match.type === 'movie' ? 'vod' : 'series', String(item.match.categoryId), String(item.match.xtreamId)] : ['/workspace/search'],
            ...(item.match ? {} : { queryParams: { q: item.title } }),
        };
    }

    private typeIcon(type: 'live' | 'movie' | 'series'): string {
        if (type === 'live') return 'live_tv';
        if (type === 'movie') return 'movie';
        return 'video_library';
    }

    private openXtreamAccountInfo(playlist: PlaylistMeta): void {
        if (!isXtreamAccountPlaylist(playlist)) return;
        const title = playlist.title || playlist.filename || this.t('WORKSPACE.DASHBOARD.UNTITLED_SOURCE');
        this.shellActions.openAccountInfo({ playlist: { id: playlist._id, name: title, title, serverUrl: playlist.serverUrl, username: playlist.username, password: playlist.password } });
    }

    private confirmRemovePlaylist(playlist: PlaylistMeta): void {
        this.dialogService.openConfirmDialog({
            title: this.translate.instant('HOME.PLAYLISTS.REMOVE_DIALOG.TITLE'),
            message: this.translate.instant('HOME.PLAYLISTS.REMOVE_DIALOG.MESSAGE'),
            onConfirm: () => { void this.removePlaylist(playlist); },
        });
    }

    private async removePlaylist(playlist: PlaylistMeta): Promise<void> {
        const deleted = await this.playlistDeleteAction.deletePlaylist(playlist);
        if (!deleted) return;
        this.store.dispatch(PlaylistActions.removePlaylist({ playlistId: playlist._id }));
        this.snackBar.open(this.translate.instant('HOME.PLAYLISTS.REMOVE_DIALOG.SUCCESS'), undefined, { duration: 2000 });
    }

    private t(key: string): string { return this.translate.instant(key); }
}