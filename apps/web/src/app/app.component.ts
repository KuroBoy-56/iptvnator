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
import { filter, take } from 'rxjs';
import { DataService, RuntimeCapabilitiesService, SettingsStore } from '@iptvnator/services';
import { AUTO_UPDATE_PLAYLISTS, Language, OPEN_FILE, Settings, STORE_KEY, Theme, createDevLogger } from '@iptvnator/shared/interfaces';
import { SettingsService } from './services/settings.service';
import { PanelCacheSyncService } from './services/panel-cache-sync.service';
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
    private epgBridge = inject(EpgRuntimeBridgeService);
    private epgService = inject(EpgService);
    private snackBar = inject(MatSnackBar);
    private router = inject(Router);
    private store = inject(Store);
    private translate = inject(TranslateService);
    private settingsService = inject(SettingsService);
    private settingsStore = inject(SettingsStore);
    private runtime = inject(RuntimeCapabilitiesService);
    private panelCacheSync = inject(PanelCacheSyncService);
    // Instantiated early so MPV/VLC progress reaches the panel from any screen.
    private externalPlayback = inject(PORTAL_EXTERNAL_PLAYBACK);
    private readonly workspaceShellActions = inject(WORKSPACE_SHELL_ACTIONS);

    private readonly DEFAULT_LANG = Language.ENGLISH;

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

            this.panelCacheSync.start();
        }

    }

    ngOnInit() {
        this.store.dispatch(PlaylistActions.loadPlaylists());
        this.translate.setDefaultLang(this.DEFAULT_LANG);
        this.initSettings();
        this.triggerAutoUpdatePlaylists();
    }

    ngOnDestroy() {
        this.panelCacheSync.stop();
    }

    initSettings(): void {
        this.settingsService
            .getValueFromLocalStorage<Settings>(STORE_KEY.Settings)
            .subscribe((settings: Settings) => {
                if (settings && Object.keys(settings).length > 0) {
                    const resolvedLang = settings.language ?? this.DEFAULT_LANG;
                    this.translate.use(resolvedLang);
                    try {
                        localStorage.setItem('iptvnator:preferred-language', resolvedLang);
                    } catch {
                        // Storage unavailable.
                    }
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