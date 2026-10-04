import { app, BrowserWindow, session } from 'electron';
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
import PanelEvents from './app/panel/panel.events';

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

app.setName('LatMpx TV+');
app.userAgentFallback = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

app.commandLine.appendSwitch('disable-web-security');
app.commandLine.appendSwitch('ignore-certificate-errors');
app.commandLine.appendSwitch('allow-running-insecure-content');
app.commandLine.appendSwitch('disable-features', 'IsolateOrigins,site-per-process,BlockInsecurePrivateNetworkRequests');
app.commandLine.appendSwitch('disable-site-isolation-trials');
app.commandLine.appendSwitch('js-flags', '--max-old-space-size=4096');

if (
    process.platform === 'linux' &&
    !app.commandLine.hasSwitch('ozone-platform') &&
    !process.env.ELECTRON_OZONE_PLATFORM_HINT
) {
    app.commandLine.appendSwitch('ozone-platform', 'x11');
}

app.on('certificate-error', (event, webContents, url, error, certificate, callback) => {
    event.preventDefault();
    callback(true);
});

const electronUserDataPath = getElectronUserDataPath();
if (electronUserDataPath) {
    app.setPath('userData', electronUserDataPath);
}

let fixPathScheduled = false;

function scheduleDeferredFixPath(): void {
    if (fixPathScheduled || process.platform === 'win32') return;
    fixPathScheduled = true;
    setImmediate(() => {
        try {
            fixPath();
            if (isStartupTraceEnabled()) trace('startup', 'fix-path:done');
        } catch { /* best effort */ }
    });
}

export default class Main {
    static initialize() {
        if (SquirrelEvents.handleEvents()) app.quit();
    }
    static bootstrapApp() {
        if (isStartupTraceEnabled()) trace('startup', 'bootstrap-app');
        App.main(app, BrowserWindow);
    }
    static async bootstrapAppEvents() {
        if (isStartupTraceEnabled()) trace('startup', 'bootstrap-events:start');

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
        PanelEvents.bootstrapPanelEvents();

        if (App.mainWindow) setDownloadsMainWindow(App.mainWindow);

        await App.loadMainWindow();
        await initDatabase();

        if (isStartupTraceEnabled()) trace('startup', 'init-database:done');
        await resetStaleDownloads();
        if (isStartupTraceEnabled()) trace('startup', 'reset-stale-downloads:done');
        if (isStartupTraceEnabled()) trace('startup', 'bootstrap-events:done');

        scheduleDeferredFixPath();
    }
}

Main.initialize();
Main.bootstrapApp();

app.whenReady().then(async () => {
    session.defaultSession.setCertificateVerifyProc((request, callback) => callback(0));

    session.defaultSession.webRequest.onBeforeSendHeaders((details, callback) => {
        if (details.url.startsWith('http://') || details.url.startsWith('https://')) {
            details.requestHeaders['User-Agent'] = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
            delete details.requestHeaders['Origin'];
            delete details.requestHeaders['origin'];
            delete details.requestHeaders['Referer'];
            delete details.requestHeaders['referer'];
        }
        callback({ cancel: false, requestHeaders: details.requestHeaders });
    });

    if (isStartupTraceEnabled()) trace('startup', 'app.whenReady');
    await Main.bootstrapAppEvents();
});

app.on('before-quit', () => {
    shutdownEmbeddedMpv();
    shutdownMpvSession();
    shutdownVlcSession();
    void databaseWorkerClient.shutdown();
});