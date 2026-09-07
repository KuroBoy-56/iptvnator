// @ts-nocheck
import { app, BrowserWindow, ipcMain, dialog, session } from 'electron';
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
import { execSync, spawn } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import * as net from 'net';

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
        } catch (error) {}
    });
}

let mpvProcess: any = null;
let nextMpvStart = 0;

ipcMain.on('SET_MPV_START', (event, position) => {
    nextMpvStart = position;
});

async function launchMpvPortable(streamUrl: string, streamTitle: string, playlistId: string, poster: string, type: string, itemId: string, categoryId: string, initialPosition: number, onPositionUpdate: (pos: number) => void) {
    const pipeName = '\\\\.\\pipe\\iptvnator-mpv-pipe';
    const mpvPath = app.isPackaged 
        ? path.join(process.resourcesPath, 'bin', 'mpv', 'mpv.exe')
        : path.join(process.cwd(), 'bin', 'mpv', 'mpv.exe');

    if (!fs.existsSync(mpvPath)) {
        dialog.showErrorBox('Error Fatal', `El sistema no encontró el archivo en:\n\n${mpvPath}`);
        return;
    }

    if (nextMpvStart > 5 && initialPosition < 5) {
        initialPosition = nextMpvStart;
    }
    nextMpvStart = 0;

    const args = [
        streamUrl,
        `--input-ipc-server=${pipeName}`,
        '--fullscreen',
        '--force-window=immediate',
        '--keep-open=yes'
    ];

    if (initialPosition > 5) {
        args.push(`--start=${initialPosition}`);
    }

    mpvProcess = spawn(mpvPath, args);

    mpvProcess.on('error', (err: any) => {
        dialog.showErrorBox('Error ejecutando MPV', err.message || String(err));
    });

    let pipeClient: net.Socket | null = null;
    let lastKnownPosition = 0;
    let lastKnownDuration = 0;
    let notifyInterval: NodeJS.Timeout;

    function connectPipe(retries = 5) {
        pipeClient = net.createConnection(pipeName);
        let buffer = '';

        pipeClient.on('connect', () => {
            setInterval(() => {
                if (pipeClient && !pipeClient.destroyed) {
                    pipeClient.write(JSON.stringify({ command: ['get_property', 'time-pos'], request_id: 100 }) + '\n');
                    pipeClient.write(JSON.stringify({ command: ['get_property', 'duration'], request_id: 200 }) + '\n');
                }
            }, 1000);

            notifyInterval = setInterval(() => {
                if (lastKnownPosition > 5) {
                    const win = BrowserWindow.getAllWindows()[0];
                    if (win && !win.isDestroyed()) {
                        win.webContents.send('MPV_PROGRESS_UPDATE', {
                            position: lastKnownPosition,
                            duration: lastKnownDuration,
                            pbInfo: {
                                title: streamTitle,
                                url: streamUrl,
                                poster: poster,
                                type: type,
                                id: itemId,
                                categoryId: categoryId,
                                playlistId: playlistId,
                                forcedHash: 'bad90e6f3a74f4aeab6ccee156c1726d'
                            }
                        });
                    }
                }
            }, 5000);
        });

        pipeClient.on('data', (chunk) => {
            buffer += chunk.toString();
            let newlineIndex;
            while ((newlineIndex = buffer.indexOf('\n')) !== -1) {
                const line = buffer.slice(0, newlineIndex);
                buffer = buffer.slice(newlineIndex + 1);
                if (!line.trim()) continue;
                try {
                    const response = JSON.parse(line);
                    if (response.request_id === 100 && typeof response.data === 'number') {
                        lastKnownPosition = response.data;
                    } else if (response.request_id === 200 && typeof response.data === 'number') {
                        lastKnownDuration = response.data;
                    }
                } catch (e) {}
            }
        });

        pipeClient.on('error', (err) => {
            if (retries > 0) {
                setTimeout(() => connectPipe(retries - 1), 1000);
            }
        });
    }

    setTimeout(() => connectPipe(), 1000);

    mpvProcess.on('close', async () => {
        if (notifyInterval) clearInterval(notifyInterval);
        if (pipeClient) pipeClient.destroy();
        mpvProcess = null;
        
        onPositionUpdate(lastKnownPosition);
        
        const win = BrowserWindow.getAllWindows()[0];
        if (win && !win.isDestroyed()) {
            win.webContents.send('MPV_PROGRESS_UPDATE', {
                position: lastKnownPosition,
                duration: lastKnownDuration,
                closed: true,
                forcedHash: 'bad90e6f3a74f4aeab6ccee156c1726d'
            });
        }
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

    ipcMain.on('SET_SECURE_DNS', (event, provider) => {
        try {
            if (provider === 'cloudflare') app.configureHostResolver({ secureDnsMode: 'secure', secureDnsServers: ['https://cloudflare-dns.com/dns-query'] });
            else if (provider === 'google') app.configureHostResolver({ secureDnsMode: 'secure', secureDnsServers: ['https://dns.google/dns-query'] });
            else app.configureHostResolver({ secureDnsMode: 'off' });
        } catch (e) {}
    });

    ipcMain.handle('GET_HARDWARE_ID', () => {
        try {
            let uuid = '';
            if (process.platform === 'win32') uuid = execSync('wmic csproduct get uuid').toString().split('\n')[1].trim();
            else if (process.platform === 'darwin') uuid = execSync('ioreg -rd1 -c IOPlatformExpertDevice | grep IOPlatformUUID').toString().split('"')[3];
            else uuid = execSync('cat /etc/machine-id').toString().trim();
            if (uuid) {
                const clean = uuid.replace(/[^a-fA-F0-9]/g, '').toUpperCase();
                const first16 = clean.substring(0, 16).padEnd(16, '0');
                const pairs = first16.match(/.{1,2}/g);
                return pairs ? pairs.join('.') : null;
            }
        } catch (e) {} return null;
    });

    if (isStartupTraceEnabled()) trace('startup', 'app.whenReady');
    await Main.bootstrapAppEvents();

    ipcMain.removeHandler('OPEN_MPV_PLAYER');
    ipcMain.removeAllListeners('OPEN_MPV_PLAYER');

    ipcMain.handle('OPEN_MPV_PLAYER', async (event, args) => {
        try {
            if (!args) { dialog.showErrorBox('Error', 'No se recibió datos para reproducir.'); return { success: false }; }
            const streamUrl = typeof args === 'string' ? args : args.url;
            const streamTitle = typeof args === 'object' && args.title ? args.title : streamUrl;
            const playlistId = typeof args === 'object' && args.playlistId ? args.playlistId : 'default_playlist';
            const poster = typeof args === 'object' && args.poster ? args.poster : '';
            const type = typeof args === 'object' && args.type ? args.type : 'movie';
            const itemId = typeof args === 'object' && args.id ? String(args.id) : '';
            const categoryId = typeof args === 'object' && args.categoryId ? String(args.categoryId) : '';
            const initialPosition = typeof args === 'object' && args.initialPosition ? args.initialPosition : 0;
            
            return new Promise((resolve) => {
                launchMpvPortable(streamUrl, streamTitle, playlistId, poster, type, itemId, categoryId, initialPosition, (position) => {
                    resolve({ success: true, finalPosition: position }); 
                });
            });
        } catch (error: any) {
            dialog.showErrorBox('Error Crítico', error.message || String(error));
            return { success: false };
        }
    });
});

app.on('before-quit', () => {
    if (mpvProcess) mpvProcess.kill();
    shutdownEmbeddedMpv();
    shutdownMpvSession();
    shutdownVlcSession();
    void databaseWorkerClient.shutdown();
});