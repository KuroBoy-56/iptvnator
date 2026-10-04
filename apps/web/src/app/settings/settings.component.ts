import { CommonModule } from '@angular/common';
import {
    Component,
    computed,
    inject,
    Input,
    DestroyRef,
    OnDestroy,
    OnInit,
    signal,
    ViewEncapsulation,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormArray, FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import {
    MAT_DIALOG_DATA,
    MatDialog,
    MatDialogModule,
} from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { Router } from '@angular/router';
import {
    EpgRuntimeBridgeService,
    EpgService,
} from '@iptvnator/epg/data-access';
import { SettingsContextService } from '@iptvnator/workspace/shell/util';
import { Store } from '@ngrx/store';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { DialogService } from '@iptvnator/ui/components';
import {
    selectAllPlaylistsMeta,
    selectIsEpgAvailable,
} from '@iptvnator/m3u-state';
import { take } from 'rxjs';
import { DataService, RuntimeCapabilitiesService } from '@iptvnator/services';
import {
    EmbeddedMpvSupport,
    CoverSize,
    ELECTRON_BRIDGE_APP_UPDATE_STATUSES,
    ElectronBridgeAppUpdateStatus,
    EpgViewMode,
    Language,
    StreamFormat,
    Theme,
    VideoPlayer,
} from '@iptvnator/shared/interfaces';
import { SettingsStore } from '../services/settings-store.service';
import { SettingsService } from './../services/settings.service';
import { SettingsAboutSectionComponent } from './settings-about-section.component';
import { SettingsBackupSectionComponent } from './settings-backup-section.component';
import { SettingsDashboardSectionComponent } from './settings-dashboard-section.component';
import {
    SettingsDeleteAllPlaylistsDialogComponent,
    SettingsDeleteAllPlaylistsDialogData,
} from './settings-delete-all-playlists-dialog.component';
import { SettingsEpgSectionComponent } from './settings-epg-section.component';
import {
    applyEpgUrlsToFormArray,
    createEpgUrlControl,
    createSettingsForm,
    createSettingsFromFormValue,
} from './settings-form.utils';
import { SettingsGeneralSectionComponent } from './settings-general-section.component';
import {
    SettingsPlaylistDeleteSummary,
    SettingsSection,
} from './settings.models';
import {
    buildSettingsSectionNavItems,
    SETTINGS_COVER_SIZE_OPTIONS,
    SETTINGS_EMBEDDED_PLAYER_OPTIONS,
    SETTINGS_EPG_VIEW_MODE_OPTIONS,
    SETTINGS_OS_PLAYER_OPTIONS,
    SETTINGS_STARTUP_BEHAVIOR_OPTIONS,
    SETTINGS_THEME_OPTIONS,
} from './settings-options';
import { SettingsPlaybackSectionComponent } from './settings-playback-section.component';
import { SettingsRemoteControlSectionComponent } from './settings-remote-control-section.component';
import { SettingsResetSectionComponent } from './settings-reset-section.component';
import { SettingsSectionScrollDirective } from './settings-section-scroll.directive';
import { SecureDnsPickerComponent } from '../panel-login/secure-dns-picker.component';
import { SettingsTmdbSectionComponent } from './settings-tmdb-section.component';
import { SettingsBackupFacade } from './settings-backup.facade';
import { SettingsPlaylistResetFacade } from './settings-playlist-reset.facade';
import {
    buildRemoveAllProgressLabel,
    buildSettingsPlaylistDeleteSummary,
} from './settings-playlist-summary.utils';
import { SettingsSnackbarService } from './settings-snackbar.service';
import { AppUpdateReleaseNotesDialogComponent } from './app-update-release-notes-dialog.component';

const APP_UPDATE_STATUS_LOAD_ATTEMPTS = 60;
const APP_UPDATE_STATUS_LOAD_RETRY_DELAY_MS = 250;

@Component({
    templateUrl: './settings.component.html',
    styleUrls: ['./settings.component.scss'],
    host: {
        class: 'settings-page-host',
    },
    encapsulation: ViewEncapsulation.None,
    imports: [
        CommonModule,
        MatButtonModule,
        MatIconModule,
        ReactiveFormsModule,
        TranslateModule,
        MatDialogModule,
        SettingsAboutSectionComponent,
        SettingsBackupSectionComponent,
        SettingsDashboardSectionComponent,
        SettingsEpgSectionComponent,
        SettingsGeneralSectionComponent,
        SettingsPlaybackSectionComponent,
        SettingsRemoteControlSectionComponent,
        SettingsResetSectionComponent,
        SettingsSectionScrollDirective,
        SettingsTmdbSectionComponent,
        SecureDnsPickerComponent,
    ],
    providers: [
        SettingsBackupFacade,
        SettingsPlaylistResetFacade,
        SettingsSnackbarService,
    ],
})
export class SettingsComponent implements OnInit, OnDestroy {
    private dialogService = inject(DialogService);
    public dataService = inject(DataService);
    private epgService = inject(EpgService);
    private formBuilder = inject(FormBuilder);
    private destroyRef = inject(DestroyRef);
    private router = inject(Router);
    private settingsService = inject(SettingsService);
    private settingsSnackbar = inject(SettingsSnackbarService);
    private store = inject(Store);
    private translate = inject(TranslateService);
    private matDialog = inject(MatDialog);
    private readonly backupFacade = inject(SettingsBackupFacade);
    private readonly playlistResetFacade = inject(SettingsPlaylistResetFacade);
    private readonly runtime = inject(RuntimeCapabilitiesService);
    private readonly epgBridge = inject(EpgRuntimeBridgeService);
    private readonly dialogData = inject<{ isDialog: boolean } | null>(
        MAT_DIALOG_DATA,
        { optional: true }
    );

    @Input() isDialog = this.dialogData?.isDialog ?? false;
    readonly languageEnum = Language;
    readonly streamFormatEnum = StreamFormat;

    readonly isDesktop = this.runtime.isElectron;
    readonly supportsDesktopFileSave = this.runtime.supportsDesktopFileSave;
    readonly supportsEpg =
        this.epgBridge.supportsImport && this.epgBridge.supportsDataManagement;
    readonly supportsManagedExternalPlayers =
        this.runtime.supportsManagedExternalPlayers;
    readonly supportsExternalPlayerPathSettings =
        this.runtime.supportsExternalPlayerPathSettings;
    readonly supportsRemoteControl = this.runtime.supportsRemoteControl;
    readonly embeddedMpvSupport = signal<EmbeddedMpvSupport | null>(null);
    readonly supportsEmbeddedMpv = computed(
        () => this.isDesktop && !!this.embeddedMpvSupport()?.supported
    );

    readonly isPwa = this.runtime.isPwa;

    private readonly settingsCtx = inject(SettingsContextService);
    readonly activeSection = this.settingsCtx.activeSection;

    readonly osPlayers = computed(() => {
        // Detectamos si alguna de las listas cargadas tiene la palabra "demo" (sin importar mayúsculas/minúsculas)
        const isDemo = this.playlists().some(p => p.title?.toLowerCase().includes('demo'));

        const options = [];
        if (this.supportsEmbeddedMpv()) {
            options.push({
                id: VideoPlayer.EmbeddedMpv,
                labelKey: 'SETTINGS.PLAYER_EMBEDDED_MPV',
            });
        }
        if (this.supportsManagedExternalPlayers) {
            const externalOpts = SETTINGS_OS_PLAYER_OPTIONS.filter(opt => {
                if (opt.id === VideoPlayer.VLC && isDemo) {
                    return false;
                }
                return true;
            });
            options.push(...externalOpts);
        }
        return options;
    });

    readonly players = computed(() => [
        ...SETTINGS_EMBEDDED_PLAYER_OPTIONS,
        ...this.osPlayers(),
    ]);

    version = '';
    updateMessage = '';
    readonly appUpdateStatus = signal<ElectronBridgeAppUpdateStatus | null>(null);
    epgAvailable$ = this.store.select(selectIsEpgAvailable);
    readonly playlists = this.store.selectSignal(selectAllPlaylistsMeta);

    readonly themeOptions = SETTINGS_THEME_OPTIONS;
    readonly coverSizeOptions = SETTINGS_COVER_SIZE_OPTIONS;
    readonly startupBehaviorOptions = SETTINGS_STARTUP_BEHAVIOR_OPTIONS;
    readonly epgViewModeOptions = SETTINGS_EPG_VIEW_MODE_OPTIONS;

    settingsForm = createSettingsForm(this.formBuilder, this.supportsEpg);
    epgUrl = this.settingsForm.get('epgUrl') as FormArray;
    localIpAddresses = signal<string[]>([]);
    visibleQrCodeIp = signal<string | null>(null);
    readonly isRemovingAllPlaylists = this.playlistResetFacade.isRemovingAllPlaylists;
    readonly isClearingEpgData = signal(false);
    readonly isExportingData = this.backupFacade.isExportingData;
    readonly removeAllProgress = this.playlistResetFacade.removeAllProgress;

    private settingsStore = inject(SettingsStore);
    readonly sectionNavItems: SettingsSection[] = buildSettingsSectionNavItems({
        supportsEpg: this.supportsEpg,
        supportsRemoteControl: this.supportsRemoteControl,
    });

    readonly playlistDeleteSummary = computed<SettingsPlaylistDeleteSummary>(
        () => buildSettingsPlaylistDeleteSummary(this.playlists())
    );

    readonly canRemoveAllPlaylists = computed(
        () =>
            !this.isRemovingAllPlaylists() &&
            this.playlistDeleteSummary().total > 0
    );

    private unsubscribeAppUpdateStatus: (() => void) | null = null;

    readonly removeAllProgressLabel = computed(() => {
        return buildRemoveAllProgressLabel({
            isRemovingAllPlaylists: this.isRemovingAllPlaylists(),
            progress: this.removeAllProgress(),
            translate: (key, params) => this.translate.instant(key, params),
        });
    });

    get sectionNav(): SettingsSection[] {
        return this.sectionNavItems.filter((section) => section.visible);
    }

    async ngOnInit(): Promise<void> {
        await this.settingsStore.loadSettings();
        this.setSettings();
        this.bindDashboardControlsEnabledState();
        void this.loadEmbeddedMpvSupport();
        this.checkAppVersion();
        this.bindAppUpdateStatusEvents();
        void this.loadAppUpdateStatus();
        void this.fetchLocalIpAddresses();

        if (!this.isDialog) {
            this.settingsCtx.setSections(this.sectionNav);
        }
    }

    private async loadEmbeddedMpvSupport(): Promise<void> {
        if (!this.isDesktop) {
            this.embeddedMpvSupport.set({
                supported: false,
                platform: 'web',
                reason: 'Embedded MPV requires the Electron desktop build.',
            });
            return;
        }

        if (!window.electron?.getEmbeddedMpvSupport) {
            this.embeddedMpvSupport.set({
                supported: false,
                platform: window.electron.platform,
                reason: 'Embedded MPV support is not available in this build.',
            });
            return;
        }

        try {
            this.embeddedMpvSupport.set(
                await window.electron.getEmbeddedMpvSupport()
            );
        } catch (error) {
            this.embeddedMpvSupport.set({
                supported: false,
                platform: window.electron.platform,
                reason: error instanceof Error ? error.message : String(error),
            });
        }
    }

    ngOnDestroy(): void {
        this.unsubscribeAppUpdateStatus?.();
        this.unsubscribeAppUpdateStatus = null;
        this.settingsCtx.reset();
    }

    private bindAppUpdateStatusEvents(): void {
        if (!this.isDesktop || !window.electron?.onAppUpdateStatusChange) {
            return;
        }

        this.unsubscribeAppUpdateStatus =
            window.electron.onAppUpdateStatusChange((status) => {
                this.appUpdateStatus.set(status);
            });
    }

    private async loadAppUpdateStatus(): Promise<void> {
        if (!this.isDesktop) {
            return;
        }

        let lastError: unknown;

        for (
            let attempt = 1;
            attempt <= APP_UPDATE_STATUS_LOAD_ATTEMPTS;
            attempt += 1
        ) {
            const electron = window.electron;

            if (electron?.getAppUpdateStatus) {
                try {
                    this.appUpdateStatus.set(
                        await electron.getAppUpdateStatus()
                    );
                    return;
                } catch (error) {
                    lastError = error;
                }
            }

            if (attempt === APP_UPDATE_STATUS_LOAD_ATTEMPTS) {
                console.warn(
                    'Failed to load app update status:',
                    lastError ??
                        new Error('Desktop app update bridge is unavailable')
                );
                return;
            }

            await this.waitForAppUpdateStatusRetry();
        }
    }

    private async waitForAppUpdateStatusRetry(): Promise<void> {
        await new Promise<void>((resolve) => {
            setTimeout(resolve, APP_UPDATE_STATUS_LOAD_RETRY_DELAY_MS);
        });
    }

    async checkForAppUpdate(): Promise<void> {
        if (!this.isDesktop || !window.electron?.checkForAppUpdate) {
            return;
        }
        this.appUpdateStatus.set(await window.electron.checkForAppUpdate());
    }

    async downloadAppUpdate(): Promise<void> {
        if (!this.isDesktop || !window.electron?.downloadAppUpdate) {
            return;
        }
        this.appUpdateStatus.set(await window.electron.downloadAppUpdate());
    }

    async installAppUpdate(): Promise<void> {
        if (!this.isDesktop || !window.electron?.installAppUpdate) {
            return;
        }
        this.appUpdateStatus.set(await window.electron.installAppUpdate());
    }

    openManualAppUpdate(): void {
        const manualDownloadUrl = this.appUpdateStatus()?.manualDownloadUrl;
        if (!manualDownloadUrl) {
            return;
        }
        window.open(manualDownloadUrl, '_blank', 'noreferrer');
    }

    openAppUpdateReleaseNotes(): void {
        const status = this.appUpdateStatus();
        const isUpdateRelease =
            status?.status === ELECTRON_BRIDGE_APP_UPDATE_STATUSES.Available ||
            status?.status ===
                ELECTRON_BRIDGE_APP_UPDATE_STATUSES.Downloading ||
            status?.status === ELECTRON_BRIDGE_APP_UPDATE_STATUSES.Downloaded;
        const initialReleaseNotesVersion = isUpdateRelease
            ? (status?.latestVersion ??
              status?.release?.version ??
              status?.currentVersion)
            : status?.currentVersion;

        this.matDialog.open(AppUpdateReleaseNotesDialogComponent, {
            autoFocus: false,
            data: {
                ...(!isUpdateRelease ? { fallbackToLatest: true } : {}),
                initialVersion: initialReleaseNotesVersion,
            },
            maxWidth: 'calc(100vw - 32px)',
            restoreFocus: true,
            width: '720px',
        });
    }

    async fetchLocalIpAddresses(): Promise<void> {
        if (
            this.supportsRemoteControl &&
            window.electron?.getLocalIpAddresses
        ) {
            const addresses = await window.electron.getLocalIpAddresses();
            this.localIpAddresses.set(addresses);
        }
    }

    toggleQrCode(ip: string): void {
        if (this.visibleQrCodeIp() === ip) {
            this.visibleQrCodeIp.set(null);
        } else {
            this.visibleQrCodeIp.set(ip);
        }
    }

    setSettings() {
        const currentSettings = this.settingsStore.getSettings();
        this.settingsForm.patchValue(currentSettings);
        this.syncDashboardControlsEnabledState(
            currentSettings.showDashboard ?? true
        );

        if (this.supportsEpg && currentSettings.epgUrl) {
            this.epgUrl.clear();
            this.setEpgUrls(currentSettings.epgUrl);
        }
    }

    private bindDashboardControlsEnabledState(): void {
        this.settingsForm
            .get('showDashboard')
            ?.valueChanges.pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe((showDashboard) =>
                this.syncDashboardControlsEnabledState(showDashboard ?? true)
            );
    }

    private syncDashboardControlsEnabledState(showDashboard: boolean): void {
        const dashboardRails = this.settingsForm.get('dashboardRails');
        if (!dashboardRails) {
            return;
        }

        if (showDashboard) {
            dashboardRails.enable({ emitEvent: false });
        } else {
            dashboardRails.disable({ emitEvent: false });
        }
    }

    selectTheme(theme: Theme): void {
        if (this.settingsForm.value.theme === theme) {
            return;
        }

        this.settingsForm.patchValue({ theme });
        this.settingsForm.get('theme')?.markAsDirty();
        this.settingsForm.markAsDirty();
        this.settingsService.changeTheme(theme);
    }

    selectCoverSize(size: CoverSize): void {
        if (this.settingsForm.value.coverSize === size) {
            return;
        }

        this.settingsForm.patchValue({ coverSize: size });
        this.settingsForm.get('coverSize')?.markAsDirty();
        this.settingsForm.markAsDirty();
        this.settingsStore.updateSettings({ coverSize: size });
    }

    selectEpgViewMode(mode: EpgViewMode): void {
        if (this.settingsForm.value.epgViewMode === mode) {
            return;
        }

        this.settingsForm.patchValue({ epgViewMode: mode });
        this.settingsForm.get('epgViewMode')?.markAsDirty();
        this.settingsForm.markAsDirty();
        this.settingsStore.updateSettings({ epgViewMode: mode });
    }

    async selectRecordingFolder(): Promise<void> {
        if (
            !this.isDesktop ||
            !window.electron?.selectEmbeddedMpvRecordingFolder
        ) {
            return;
        }

        const folder = await window.electron.selectEmbeddedMpvRecordingFolder();
        if (!folder) {
            return;
        }

        this.settingsForm.patchValue({ recordingFolder: folder });
        this.settingsForm.get('recordingFolder')?.markAsDirty();
        this.settingsForm.markAsDirty();
    }

    setEpgUrls(epgUrls: string[] | string): void {
        applyEpgUrlsToFormArray(this.epgUrl, epgUrls);
    }

    checkAppVersion(): void {
        this.settingsService
            .getAppVersion()
            .pipe(take(1))
            .subscribe((version) => this.showVersionInformation(version));
    }

    showVersionInformation(currentVersion: string): void {
        const isOutdated = this.isCurrentVersionOutdated(currentVersion);

        if (isOutdated) {
            this.updateMessage = `${
                this.translate.instant(
                    'SETTINGS.NEW_VERSION_AVAILABLE'
                ) as string
            }: ${currentVersion}`;
        } else {
            this.updateMessage = this.translate.instant(
                'SETTINGS.LATEST_VERSION'
            );
        }
    }

    isCurrentVersionOutdated(latestVersion: string): boolean {
        this.version = this.dataService.getAppVersion();
        return this.settingsService.isVersionOutdated(
            this.version,
            latestVersion
        );
    }

    onSubmit(): void {
        const settings = this.createSettingsFromFormValue();

        this.settingsStore.updateSettings(settings).then(() => {
            this.applyChangedSettings();

            if (window.electron) {
                window.electron.updateSettings(settings);
            }

            if (this.supportsExternalPlayerPathSettings && window.electron) {
                window.electron.setMpvPlayerPath(settings.mpvPlayerPath);
                window.electron.setVlcPlayerPath(settings.vlcPlayerPath);
            }
        });
        if (this.isDialog) {
            this.matDialog.closeAll();
        }
    }

    private createSettingsFromFormValue() {
        return createSettingsFromFormValue(
            this.settingsForm,
            this.settingsStore.getSettings()
        );
    }

    applyChangedSettings(): void {
        this.settingsForm.markAsPristine();
        if (this.supportsEpg) {
            let epgUrls = this.settingsForm.value.epgUrl;
            if (epgUrls) {
                if (!Array.isArray(epgUrls)) {
                    epgUrls = [epgUrls];
                }
                const validEpgUrls = epgUrls.filter(
                    (url): url is string =>
                        typeof url === 'string' && url !== ''
                );
                if (validEpgUrls.length > 0) {
                    this.epgService.fetchEpg(validEpgUrls);
                }
            }
        }
        this.translate.use(
            this.settingsForm.value.language ?? Language.ENGLISH
        );
        this.settingsService.changeTheme(
            this.settingsForm.value.theme ?? Theme.SystemTheme
        );
        this.settingsSnackbar.open(
            this.translate.instant('SETTINGS.SETTINGS_SAVED')
        );
    }

    backToHome(): void {
        if (this.isDialog) {
            this.matDialog.closeAll();
        } else {
            this.router.navigateByUrl('/');
        }
    }

    refreshEpg(url: string): void {
        if (!this.epgBridge.supportsDataManagement || !url) {
            return;
        }
        void this.epgBridge.forceFetchEpg(
            url,
            this.settingsStore.getTrustOptions()
        );
    }

    refreshAllEpg(): void {
        if (!this.epgBridge.supportsDataManagement) return;
        const urls = (this.epgUrl.value as string[])
            .map((url) => url?.trim())
            .filter((url): url is string => Boolean(url));
        const options = this.settingsStore.getTrustOptions();
        urls.forEach((url) => void this.epgBridge.forceFetchEpg(url, options));
    }

    addEpgSource(): void {
        this.epgUrl.insert(this.epgUrl.length, createEpgUrlControl());
    }

    removeEpgSource(index: number): void {
        this.epgUrl.removeAt(index);
        this.settingsForm.markAsDirty();
    }

    clearEpgData(): void {
        this.dialogService.openConfirmDialog({
            title: this.translate.instant('SETTINGS.CLEAR_EPG_DIALOG.TITLE'),
            message: this.translate.instant(
                'SETTINGS.CLEAR_EPG_DIALOG.MESSAGE'
            ),
            onConfirm: async (): Promise<void> => {
                if (
                    !this.epgBridge.supportsDataManagement ||
                    this.isClearingEpgData()
                ) {
                    return;
                }

                this.isClearingEpgData.set(true);
                try {
                    const result = await this.epgBridge.clearEpgData();
                    if (result && result.success === false) {
                        throw new Error('Clear EPG returned success=false');
                    }
                    this.settingsSnackbar.open(
                        this.translate.instant('SETTINGS.EPG_DATA_CLEARED')
                    );
                    this.refreshAllEpg();
                } catch (error) {
                    console.error('Failed to clear EPG data:', error);
                    this.settingsSnackbar.open(
                        this.translate.instant('SETTINGS.EPG_DATA_CLEAR_FAILED')
                    );
                } finally {
                    this.isClearingEpgData.set(false);
                }
            },
        });
    }

    async exportData() {
        await this.backupFacade.exportData(() => this.waitForUiFeedbackFrame());
    }

    importData() {
        this.backupFacade.importData(() => this.setSettings());
    }

    private async waitForUiFeedbackFrame(): Promise<void> {
        if (typeof window.requestAnimationFrame !== 'function') {
            await Promise.resolve();
            return;
        }

        await new Promise<void>((resolve) => {
            window.requestAnimationFrame(() => resolve());
        });
    }

    removeAll(): void {
        if (!this.canRemoveAllPlaylists()) {
            return;
        }

        this.matDialog
            .open<
                SettingsDeleteAllPlaylistsDialogComponent,
                SettingsDeleteAllPlaylistsDialogData,
                boolean
            >(SettingsDeleteAllPlaylistsDialogComponent, {
                autoFocus: false,
                data: {
                    summary: this.playlistDeleteSummary(),
                },
                maxWidth: 'calc(100vw - 32px)',
                restoreFocus: true,
                width: '460px',
            })
            .afterClosed()
            .pipe(take(1))
            .subscribe((confirmed) => {
                if (confirmed) {
                    void this.playlistResetFacade.removeAllConfirmed(() =>
                        this.waitForUiFeedbackFrame()
                    );
                }
            });
    }
}