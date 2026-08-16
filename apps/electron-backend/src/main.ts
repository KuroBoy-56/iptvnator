import { app, BrowserWindow, ipcMain } from 'electron';
import { getElectronUserDataPath } from '@iptvnator/shared/database';
import fixPath from 'fix-path';
import App from './app/app';
import { initDatabase } from './app/database/connection';
import DatabaseEvents from './app/events/database.events';
import {
    resetStaleDownloads,
    setMainWindow as setDownloadsMainWindow,
} from './app/events/database/downloads.events';
import ElectronEvents from './app/events/electron.events';
import EmbeddedMpvEvents, {
    shutdownEmbeddedMpv,
} from './app/events/embedded-mpv.events';
import EpgEvents from './app/events/epg.events';
import { shutdownMpvSession } from './app/events/mpv-session.service';
import PlayerEvents from './app/events/player.events';
import { shutdownVlcSession } from './app/events/vlc-session.service';
import PlaylistEvents from './app/events/playlist.events';
import RemoteControlEvents from './app/events/remote-control.events';
import SettingsEvents from './app/events/settings.events';
import SharedEvents from './app/events/shared.events';
import SquirrelEvents from './app/events/squirrel.events';
import StalkerEvents from './app/events/stalker.events';
import { isStartupTraceEnabled, trace } from './app/services/debug-trace';
import { registerStaticHeaderShims } from './app/services/request-header-overrides.service';
import { databaseWorkerClient } from './app/services/database-worker-client';
import WindowEvents from './app/events/window.events';
import XtreamEvents from './app/events/xtream.events';
import { environment } from './environments/environment';
import { execSync } from 'child_process';

app.setName('LatMpx TV+');

if (
    process.platform === 'linux' &&
    !app.commandLine.hasSwitch('ozone-platform') &&
    !process.env.ELECTRON_OZONE_PLATFORM_HINT
) {
    app.commandLine.appendSwitch('ozone-platform', 'x11');
}

const electronUserDataPath = getElectronUserDataPath();

if (electronUserDataPath) {
    app.setPath('userData', electronUserDataPath);
}

let fixPathScheduled = false;

function scheduleDeferredFixPath(): void {
    if (fixPathScheduled || process.platform === 'win32') {
        return;
    }

    fixPathScheduled = true;
    setImmediate(() => {
        try {
            fixPath();
            if (isStartupTraceEnabled()) {
                trace('startup', 'fix-path:done');
            }
        } catch (error) {
        }
    });
}

export default class Main {
    static initialize() {
        if (SquirrelEvents.handleEvents()) {
            app.quit();
        }
    }

    static bootstrapApp() {
        if (isStartupTraceEnabled()) {
            trace('startup', 'bootstrap-app');
        }
        App.main(app, BrowserWindow);
    }

    static async bootstrapAppEvents() {
        if (isStartupTraceEnabled()) {
            trace('startup', 'bootstrap-events:start');
        }

        registerStaticHeaderShims();
        ElectronEvents.bootstrapElectronEvents();
        WindowEvents.bootstrapWindowEvents();
        EmbeddedMpvEvents.bootstrapEmbeddedMpvEvents();
        PlaylistEvents.bootstrapPlaylistEvents();
        SharedEvents.bootstrapSharedEvents();
        PlayerEvents.bootstrapPlayerEvents();
        SettingsEvents.bootstrapSettingsEvents();
        StalkerEvents.bootstrapStalkerEvents();
        XtreamEvents.bootstrapXtreamEvents();
        DatabaseEvents.bootstrapDatabaseEvents();
        EpgEvents.bootstrapEpgEvents();
        RemoteControlEvents.bootstrapRemoteControlEvents();

        if (App.mainWindow) {
            setDownloadsMainWindow(App.mainWindow);
        }

        await App.loadMainWindow();

        await initDatabase();

        if (isStartupTraceEnabled()) {
            trace('startup', 'init-database:done');
        }

        await resetStaleDownloads();

        if (isStartupTraceEnabled()) {
            trace('startup', 'reset-stale-downloads:done');
        }

        if (isStartupTraceEnabled()) {
            trace('startup', 'bootstrap-events:done');
        }

        scheduleDeferredFixPath();
    }
}

Main.initialize();

Main.bootstrapApp();

app.whenReady().then(async () => {
    ipcMain.handle('GET_HARDWARE_ID', () => {
        try {
            let uuid = '';
            if (process.platform === 'win32') {
                uuid = execSync('wmic csproduct get uuid').toString().split('\n')[1].trim();
            } else if (process.platform === 'darwin') {
                uuid = execSync('ioreg -rd1 -c IOPlatformExpertDevice | grep IOPlatformUUID').toString().split('"')[3];
            } else {
                uuid = execSync('cat /etc/machine-id').toString().trim();
            }
            if (uuid) {
                const clean = uuid.replace(/[^a-fA-F0-9]/g, '').toUpperCase();
                const first16 = clean.substring(0, 16).padEnd(16, '0');
                const pairs = first16.match(/.{1,2}/g);
                return pairs ? pairs.join('.') : null;
            }
        } catch (e) {}
        return null;
    });

    if (isStartupTraceEnabled()) {
        trace('startup', 'app.whenReady');
    }
    await Main.bootstrapAppEvents();
});

app.on('before-quit', () => {
    shutdownEmbeddedMpv();
    shutdownMpvSession();
    shutdownVlcSession();
    void databaseWorkerClient.shutdown();
});