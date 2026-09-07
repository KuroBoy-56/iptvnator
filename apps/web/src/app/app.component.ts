import { Component, effect, HostBinding, inject, OnInit, OnDestroy } from '@angular/core';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Router, RouterOutlet } from '@angular/router';
import { Actions, ofType } from '@ngrx/effects';
import { Store } from '@ngrx/store';
import { TranslateService } from '@ngx-translate/core';
import { EpgRuntimeBridgeService, EpgService } from '@iptvnator/epg/data-access';
import { WORKSPACE_SHELL_ACTIONS } from '@iptvnator/workspace/shell/util';
import { EpgProgressPanelComponent } from '@iptvnator/ui/epg/progress-panel';
import { WindowControlsComponent } from '@iptvnator/ui/components';
import { PlaylistActions, selectAllPlaylistsMeta } from '@iptvnator/m3u-state';
import { filter, take, firstValueFrom } from 'rxjs';
import { DatabaseService, DataService, RuntimeCapabilitiesService, SettingsStore, FirebaseSyncService, PlaybackPositionService } from '@iptvnator/services';
import { AUTO_UPDATE_PLAYLISTS, Language, OPEN_FILE, Settings, STORE_KEY, Theme, createDevLogger } from '@iptvnator/shared/interfaces';
import { SettingsService } from './services/settings.service';
import { AppUpdateNotificationPanelComponent } from './app-update-notification-panel.component';
import { PORTAL_EXTERNAL_PLAYBACK } from '@iptvnator/portal/shared/util';

const debugAppComponent = createDevLogger('AppComponent');

@Component({
    selector: 'app-root',
    templateUrl: './app.component.html',
    imports: [
        AppUpdateNotificationPanelComponent,
        EpgProgressPanelComponent,
        RouterOutlet,
        WindowControlsComponent,
    ],
})
export class AppComponent implements OnInit, OnDestroy {
    @HostBinding('class.macos-platform') get isMacOS() { return this.runtime.isMacOS; }
    get usesCustomWindowControls() { return this.runtime.usesCustomWindowControls; }
    private actions$ = inject(Actions);
    private dataService = inject(DataService);
    private dbService = inject(DatabaseService);
    private epgBridge = inject(EpgRuntimeBridgeService);
    private epgService = inject(EpgService);
    private snackBar = inject(MatSnackBar);
    private router = inject(Router);
    private store = inject(Store);
    private translate = inject(TranslateService);
    private settingsService = inject(SettingsService);
    private settingsStore = inject(SettingsStore);
    private runtime = inject(RuntimeCapabilitiesService);
    private firebaseSync = inject(FirebaseSyncService);
    private playbackPositionService = inject(PlaybackPositionService);
    private externalPlayback = inject(PORTAL_EXTERNAL_PLAYBACK);
    private readonly workspaceShellActions = inject(WORKSPACE_SHELL_ACTIONS);

    private readonly DEFAULT_LANG = Language.ENGLISH;
    private backgroundSyncInterval: any = null;
    private syncedFavorites = new Set<string>();

    constructor() {
        if (this.runtime.usesCustomWindowControls) {
            document.body.classList.add('frameless-platform');
        }

        const electronProcess = this.dataService.remote?.process;
        if (this.dataService.isElectron && electronProcess && (electronProcess.platform === 'linux' || electronProcess.platform === 'win32') && electronProcess.argv.length > 2) {
            const filePath = electronProcess.argv.find((filepath: string) => filepath.endsWith('.m3u') || filepath.endsWith('.m3u8'));
            if (filePath) {
                const filePathsArray = filePath.split('/');
                const fileName = filePathsArray[filePathsArray.length - 1];
                this.dataService.sendIpcEvent(OPEN_FILE, { filePath, fileName });
            }
        }
        effect(() => {
            const size = this.settingsStore.coverSize?.() ?? 'medium';
            document.documentElement.dataset.coverSize = size;
        });

        if (this.runtime.isElectron) {
            document.addEventListener('keydown', (event) => {
                if (event.ctrlKey || event.metaKey) {
                    if (event.key === 'r') {
                        event.preventDefault();
                        this.workspaceShellActions.openGlobalRecent();
                    }
                }
            });

            this.initGlobalMpvListener();
        }

        effect(() => {
            const session = this.externalPlayback.activeSession() as any;
            if (session && session.status === 'launching' && session.contentInfo) {
                const cId = session.contentInfo.contentXtreamId;
                const pId = session.contentInfo.playlistId;
                const type = session.contentInfo.contentType;
                
                const win = window as any;
                
                try {
                    const positionObs = (this.playbackPositionService as any).getPlaybackPosition(pId, type === 'vod' ? 'movie' : type, cId);
                    firstValueFrom(positionObs).then((pos: any) => {
                        if (pos && pos.positionSeconds > 5) {
                            win.electron?.ipcRenderer.send('SET_MPV_START', pos.positionSeconds);
                        }
                    }).catch(() => {});
                } catch(e) {}
            }
        });

        this.backgroundSyncInterval = setInterval(async () => {
            try {
                const playlists = await firstValueFrom(this.store.select(selectAllPlaylistsMeta));
                const recentItems = await this.dbService.getGlobalRecentlyViewed();
                const now = Date.now();
                const win = window as any;
                const ipc = win.electron?.ipcRenderer;

                for (const pl of playlists) {
                    if (!pl.serverUrl) continue;
                    const userIdObj = { username: pl.username, password: pl.password, server: pl.serverUrl };

                    if (ipc && this.firebaseSync) {
                        try {
                            const [cloudProgress, cloudFavorites] = await Promise.all([
                                (this.firebaseSync as any).getAllProgress(userIdObj),
                                (this.firebaseSync as any).getAllFavorites(userIdObj)
                            ]);

                            if (cloudProgress) {
                                const processCloud = async (type: string, contentType: string) => {
                                    if (cloudProgress[type]) {
                                        for (const catId of Object.keys(cloudProgress[type])) {
                                            const items = type === 'Series' ? cloudProgress[type][catId] : { [catId]: cloudProgress[type][catId] };
                                            const cId = type === 'Series' ? catId : undefined;
                                            for (const itemId of Object.keys(items)) {
                                                const data = items[itemId];
                                                if (data && data.timeline > 0) {
                                                    await ipc.invoke('DB_SAVE_PLAYBACK_POSITION', {
                                                        playlistId: pl._id,
                                                        data: {
                                                            contentXtreamId: Number(itemId),
                                                            contentType: contentType,
                                                            seriesXtreamId: cId ? Number(cId) : undefined,
                                                            positionSeconds: data.timeline,
                                                            durationSeconds: data.duration || (data.timeline * 1.25),
                                                            title: data.title || data.episodeName || `Contenido Sincronizado`,
                                                            poster: data.thumbnail || undefined
                                                        }
                                                    });
                                                }
                                            }
                                        }
                                    }
                                };
                                await processCloud('Movie', 'vod');
                                await processCloud('Series', 'episode');
                            }

                            if (cloudFavorites) {
                                for (const type of ['Movie', 'Series', 'LiveTv']) {
                                    if (cloudFavorites[type]) {
                                        for (const itemId of Object.keys(cloudFavorites[type])) {
                                            const data = cloudFavorites[type][itemId];
                                            let thumb: string | undefined = undefined;
                                            let isValidFav = false;

                                            if (typeof data === 'number' || typeof data === 'string') {
                                                isValidFav = true;
                                            } else if (typeof data === 'object' && data !== null) {
                                                isValidFav = true;
                                                thumb = data.thumbnail;
                                            }

                                            if (isValidFav) {
                                                const syncKey = `${pl._id}-${itemId}`;
                                                if (!this.syncedFavorites.has(syncKey)) {
                                                    await ipc.invoke('DB_ADD_FAVORITE', {
                                                        contentId: Number(itemId),
                                                        playlistId: pl._id,
                                                        backdropUrl: thumb || undefined
                                                    });
                                                    this.syncedFavorites.add(syncKey);
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                        } catch(e) {}
                    }

                    const positions = await this.playbackPositionService.getAllPlaybackPositions(pl._id);
                    for (const pos of positions) {
                        const updatedTime = new Date(pos.updatedAt || 0).getTime();
                        if (now - updatedTime < 10000 && pos.positionSeconds > 5) {
                            const contentId = pos.contentXtreamId;
                            const meta = recentItems.find(r => String(r.xtream_id) === String(contentId) && r.playlist_id === pl._id);
                            
                            const pbInfo = {
                                id: String(contentId),
                                type: pos.contentType === 'episode' ? 'series' : 'movie',
                                categoryId: pos.seriesXtreamId ? String(pos.seriesXtreamId) : (meta?.category_id ? String(meta.category_id) : undefined),
                                playlistId: pl._id,
                                title: meta?.title || (pos as any).title || '',
                                poster: meta?.poster_url || meta?.backdrop_url || (pos as any).poster || ''
                            };

                            if (this.firebaseSync && typeof (this.firebaseSync as any).saveProgress === 'function') {
                                (this.firebaseSync as any).saveProgress(userIdObj, pbInfo, pos.positionSeconds, pos.durationSeconds || 0);
                            }
                        }
                    }
                }

                try {
                    const favorites = await this.dbService.getAllGlobalFavorites();
                    for (const fav of favorites) {
                        const contentIdStr = String(fav.xtream_id || fav.id);
                        const syncKey = `${fav.playlist_id}-${contentIdStr}`;
                        
                        if (this.syncedFavorites.has(syncKey)) continue;

                        const pl = playlists.find(p => p._id === fav.playlist_id);
                        if (!pl || !pl.serverUrl) continue;

                        const userIdObj = { username: pl.username, password: pl.password, server: pl.serverUrl };
                        let fbType = 'LiveTv';
                        if (fav.type === 'movie' || fav.type === 'vod') fbType = 'Movie';
                        if (fav.type === 'series') fbType = 'Series';

                        const finalTitle = fav.title && fav.title !== 'null' && !/^Contenido \d+$/.test(fav.title) ? fav.title : 'Contenido';
                        const meta = {
                            title: finalTitle,
                            thumbnail: fav.poster_url || fav.backdrop_url || ''
                        };
                        const timestamp = fav.added_at ? Math.floor(new Date(fav.added_at).getTime() / 1000) : Math.floor(Date.now() / 1000);

                        if (this.firebaseSync && typeof (this.firebaseSync as any).addFavorite === 'function') {
                            await (this.firebaseSync as any).addFavorite(userIdObj, fbType, contentIdStr, timestamp, meta);
                            this.syncedFavorites.add(syncKey);
                        }
                    }
                } catch(favErr) {}

            } catch(e) {}
        }, 10000); 
    }

    private initGlobalMpvListener() {
        try {
            const win = window as any;
            if (win.electron && win.electron.ipcRenderer) {
                win.electron.ipcRenderer.removeAllListeners('MPV_PROGRESS_UPDATE');
                win.electron.ipcRenderer.on('MPV_PROGRESS_UPDATE', async (event: any, data: any) => {
                    const pos = Math.floor(data.position || 0);
                    const dur = Math.floor(data.duration || 0);
                    let pbInfo = data.pbInfo || {};

                    const session = this.externalPlayback.activeSession() as any;
                    if (session && session.contentInfo) {
                        pbInfo.id = session.contentInfo.contentXtreamId;
                        pbInfo.type = session.contentInfo.contentType === 'vod' ? 'movie' : session.contentInfo.contentType;
                        pbInfo.categoryId = session.contentInfo.seriesXtreamId;
                        pbInfo.playlistId = session.contentInfo.playlistId;
                    }

                    if (pbInfo && pbInfo.id && pbInfo.type !== 'live') {
                        const positionData: any = {
                            contentXtreamId: Number(pbInfo.id),
                            contentType: pbInfo.type === 'series' ? 'episode' : 'vod',
                            positionSeconds: pos,
                            durationSeconds: dur,
                            playlistId: pbInfo.playlistId,
                            updatedAt: new Date().toISOString()
                        };

                        if (pbInfo.type === 'series') {
                            positionData.seriesXtreamId = Number(pbInfo.categoryId);
                        }

                        this.playbackPositionService.savePlaybackPosition(
                            positionData.playlistId,
                            positionData
                        );
                    }
                });
            }
        } catch (e) {}
    }

    ngOnInit() {
        this.store.dispatch(PlaylistActions.loadPlaylists());
        this.translate.setDefaultLang(this.DEFAULT_LANG);
        this.initSettings();
        this.triggerAutoUpdatePlaylists();
    }

    ngOnDestroy() {
        try {
            const win = window as any;
            if (win.electron && win.electron.ipcRenderer) {
                win.electron.ipcRenderer.removeAllListeners('MPV_PROGRESS_UPDATE');
            }
            if (this.backgroundSyncInterval) clearInterval(this.backgroundSyncInterval);
        } catch (e) {}
    }

    initSettings(): void {
        this.settingsService
            .getValueFromLocalStorage<Settings>(STORE_KEY.Settings)
            .subscribe((settings: Settings) => {
                if (settings && Object.keys(settings).length > 0) {
                    const resolvedLang = settings.language ?? this.DEFAULT_LANG;
                    this.translate.use(resolvedLang);
                    try { localStorage.setItem('iptvnator:preferred-language', resolvedLang); } catch {}
                    if (this.epgBridge.supportsImport && settings.epgUrl?.length > 0 && settings.epgUrl?.some((u) => u !== '')) {
                        this.fetchStaleEpgData(settings.epgUrl);
                    }
                    if (settings.theme) this.settingsService.changeTheme(settings.theme);
                    else this.detectDarkMode();
                } else {
                    this.detectDarkMode();
                }
            });
    }

    detectDarkMode(): void { this.settingsService.changeTheme(Theme.SystemTheme); }
    navigateToRoute(route: string) { this.router.navigateByUrl(route); }

    private async fetchStaleEpgData(urls: string[]): Promise<void> {
        if (!this.epgBridge.supportsSourceFreshness) { this.epgService.fetchEpg(urls); return; }
        try {
            const result = await this.epgBridge.checkFreshness(urls, 12);
            if (!result) { this.epgService.fetchEpg(urls); return; }
            if (result.freshUrls.length > 0 && result.staleUrls.length === 0) {
                this.snackBar.open(this.translate.instant('EPG.UP_TO_DATE'), this.translate.instant('CLOSE'), { duration: 3000 });
            }
            if (result.staleUrls.length > 0) this.epgService.fetchEpg(result.staleUrls);
        } catch (error) { this.epgService.fetchEpg(urls); }
    }

    private triggerAutoUpdatePlaylists(): void {
        this.actions$.pipe(ofType(PlaylistActions.loadPlaylistsSuccess), take(1)).subscribe(() => {
            this.store.select(selectAllPlaylistsMeta).pipe(take(1), filter((playlists) => playlists.length > 0)).subscribe((playlists) => {
                const playlistsToUpdate = playlists.filter((playlist) => playlist.autoRefresh === true);
                if (playlistsToUpdate.length > 0) {
                    this.dataService.sendIpcEvent(AUTO_UPDATE_PLAYLISTS, playlistsToUpdate);
                }
            });
        });
    }
}