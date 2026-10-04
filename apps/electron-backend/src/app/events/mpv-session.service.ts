import { ChildProcess, spawn } from 'child_process';
import { createConnection, Socket } from 'net';
import * as path from 'path';
import * as fs from 'fs';
import { BrowserWindow } from 'electron';
import { PlayerContentInfo } from '@iptvnator/shared/interfaces';
import {
    MPV_PLAYER_ARGUMENTS,
    MPV_PLAYER_PATH,
    MPV_REUSE_INSTANCE,
    store,
} from '../services/store.service';
import {
    buildExternalPlayerSpawnSpec,
    buildPlayerArgsWithCustomArguments,
    getDefaultMpvPath,
    isRunningInFlatpak,
    normalizeCustomPlayerPath,
    PlayerPathOptions,
    resolveExternalPlayerLaunchContext,
    shouldReuseMpvInstance,
} from './external-player-launch-context';
import { resolveEffectiveExternalPlaybackRequest } from './external-player-playback-request';
import {
    buildPlayerStartError,
    ExternalPlaybackSnapshot,
    externalPlayerSessions,
    sendPlaybackPositionUpdate,
    traceExternalPlayer,
} from './external-player-runtime';

export interface OpenExternalPlayerRequest {
    url: string;
    title: string;
    thumbnail?: string;
    userAgent?: string;
    referer?: string;
    origin?: string;
    contentInfo?: PlayerContentInfo;
    startTime?: number;
    headers?: Record<string, string>;
}

let mpvProcess: ChildProcess | null = null;
let mpvSocketPath: string | null = null;
let positionPollingInterval: NodeJS.Timeout | null = null;
let mpvPersistentClient: Socket | null = null;

function getMpvPath(options: PlayerPathOptions = {}): string {
    const customPath = normalizeCustomPlayerPath(store.get(MPV_PLAYER_PATH));
    if (customPath) return customPath;

    try {
        const isWin = process.platform === 'win32';
        const localMpvName = isWin ? 'mpv.exe' : 'mpv';
        const localBinPath = path.join(process.cwd(), 'bin', 'mpv', localMpvName);
        const localResourcesPath = process.resourcesPath ? path.join(process.resourcesPath, 'bin', 'mpv', localMpvName) : localBinPath;

        if (fs.existsSync(localResourcesPath)) return localResourcesPath;
        if (fs.existsSync(localBinPath)) return localBinPath;
    } catch(e) {}

    return getDefaultMpvPath(options);
}

function broadcastProgressToAngular(
    snapshot: ExternalPlaybackSnapshot, 
    contentInfo: PlayerContentInfo, 
    request: OpenExternalPlayerRequest,
    isClosed = false
) {
    try {
        // Aseguramos que TODAS las ventanas reciban el aviso de MPV
        BrowserWindow.getAllWindows().forEach(win => {
            if (!win.isDestroyed()) {
                win.webContents.send('MPV_PROGRESS_UPDATE', {
                    position: snapshot.positionSeconds,
                    duration: snapshot.durationSeconds || (snapshot.positionSeconds * 1.25),
                    closed: isClosed,
                    pbInfo: {
                        title: request.title || '',
                        url: request.url || '',
                        poster: request.thumbnail || '',
                        type: contentInfo.contentType === 'vod' ? 'movie' : contentInfo.contentType === 'episode' ? 'series' : 'live',
                        id: String(contentInfo.contentXtreamId),
                        categoryId: contentInfo.seriesXtreamId ? String(contentInfo.seriesXtreamId) : '0',
                        playlistId: contentInfo.playlistId,
                    }
                });
            }
        });
    } catch(e) {}
}

function stopPositionPolling(): void {
    if (positionPollingInterval) {
        clearInterval(positionPollingInterval);
        positionPollingInterval = null;
    }
    if (mpvPersistentClient) {
        try { mpvPersistentClient.destroy(); } catch (e) {}
        mpvPersistentClient = null;
    }
}

function startPositionPolling(
    socketPath: string,
    contentInfo: PlayerContentInfo,
    sessionId: string,
    request: OpenExternalPlayerRequest,
    onSnapshotCallback?: (snapshot: ExternalPlaybackSnapshot) => void
): void {
    stopPositionPolling();

    let lastPosition = 0;
    let lastDuration = 0;

    const connectPipe = (retries = 20) => {
        mpvPersistentClient = createConnection(socketPath);
        let buffer = '';

        mpvPersistentClient.on('connect', () => {
            positionPollingInterval = setInterval(() => {
                if (mpvPersistentClient && !mpvPersistentClient.destroyed) {
                    mpvPersistentClient.write(JSON.stringify({ command: ['get_property', 'time-pos'], request_id: 100 }) + '\n');
                    mpvPersistentClient.write(JSON.stringify({ command: ['get_property', 'duration'], request_id: 200 }) + '\n');
                }
            }, 2000);
        });

        mpvPersistentClient.on('data', (chunk) => {
            buffer += chunk.toString();
            let newlineIndex;
            while ((newlineIndex = buffer.indexOf('\n')) !== -1) {
                const line = buffer.slice(0, newlineIndex);
                buffer = buffer.slice(newlineIndex + 1);
                if (!line.trim()) continue;
                try {
                    const response = JSON.parse(line);
                    if (response.request_id === 100 && typeof response.data === 'number') {
                        lastPosition = response.data;
                    } else if (response.request_id === 200 && typeof response.data === 'number') {
                        lastDuration = response.data;
                    }

                    if (lastPosition > 0) {
                        const snapshot: ExternalPlaybackSnapshot = {
                            positionSeconds: Math.floor(lastPosition),
                            durationSeconds: lastDuration ? Math.floor(lastDuration) : null,
                        };
                        if (onSnapshotCallback) onSnapshotCallback(snapshot);
                        sendPlaybackPositionUpdate(sessionId, contentInfo, snapshot);
                        broadcastProgressToAngular(snapshot, contentInfo, request, false);
                    }
                } catch (e) {}
            }
        });

        mpvPersistentClient.on('error', () => {
            if (retries > 0) setTimeout(() => connectPipe(retries - 1), 1000);
            else stopPositionPolling();
        });
    };

    setTimeout(() => connectPipe(), 1000);
}

function killStoredMpvProcess(reason: string): void {
    if (!mpvProcess || mpvProcess.killed) return;
    traceExternalPlayer(reason);
    mpvProcess.kill();
    mpvProcess = null;
    mpvSocketPath = null;
    stopPositionPolling();
}

export function setMpvReuseInstance(reuseInstance: boolean): void {
    store.set(MPV_REUSE_INSTANCE, reuseInstance);
    if (!reuseInstance) killStoredMpvProcess('clean up mpv process after disabling reuse');
}

export function shutdownMpvSession(): void {
    killStoredMpvProcess('kill reused mpv process on app shutdown');
}

export async function openMpvPlayer(request: OpenExternalPlayerRequest) {
    const { url, title, thumbnail, userAgent, referer, origin, contentInfo, startTime, headers } = request;
    
    const session = externalPlayerSessions.beginSession({
        player: 'mpv', title, thumbnail, streamUrl: url, contentInfo,
    });

    try {
        const isFlatpak = isRunningInFlatpak();
        const mpvLaunchContext = resolveExternalPlayerLaunchContext('mpv', getMpvPath({ isFlatpak }), { isFlatpak });
        const customMpvArguments = store.get(MPV_PLAYER_ARGUMENTS, '');
        const reuseInstance = shouldReuseMpvInstance(store.get(MPV_REUSE_INSTANCE, false), isFlatpak);
        const { effectiveReferer, effectiveUserAgent, headerFields } = resolveEffectiveExternalPlaybackRequest({ url, userAgent, referer, origin, headers });

        let socketPath: string | null = null;
        const args: string[] = [];

        socketPath = process.platform === 'win32' ? `\\\\.\\pipe\\mpv-${Date.now()}` : `/tmp/mpvsocket-${Date.now()}`;
        args.push(`--input-ipc-server=${socketPath}`);

        args.push('--ytdl=no');
        args.push('--force-window=immediate');
        args.push('--fullscreen');
        if (effectiveUserAgent) args.push(`--user-agent=${effectiveUserAgent}`);
        if (effectiveReferer) args.push(`--referrer=${effectiveReferer}`);
        if (headerFields.length > 0) args.push(`--http-header-fields=${headerFields.join(',')}`);
        if (title) args.push(`--force-media-title=${title}`);
        
        // REANUDAR DESDE EL SEGUNDO EXACTO
        if (startTime && startTime > 0) args.push(`--start=${Math.floor(startTime)}`);
        
        args.push(url);

        let lastMpvSnapshot: ExternalPlaybackSnapshot | null = null;

        await new Promise<void>((resolve, reject) => {
            let settled = false;
            const resolveSpawn = () => { if (settled) return; settled = true; resolve(); };
            const rejectSpawn = (error: Error) => { if (settled) return; settled = true; reject(error); };

            const spawnSpec = buildExternalPlayerSpawnSpec(mpvLaunchContext, buildPlayerArgsWithCustomArguments(customMpvArguments, args));
            
            const proc = spawn(spawnSpec.command, spawnSpec.args, {
                shell: false,
                detached: !reuseInstance,
                // ELIMINADO windowsHide PORQUE PUEDE OCULTAR MPV EN ALGUNOS SISTEMAS
                stdio: 'ignore'
            });

            proc.once('spawn', resolveSpawn);
            setTimeout(resolveSpawn, 300); // Dispara la UI de Angular al instante

            mpvProcess = proc;
            mpvSocketPath = socketPath;

            externalPlayerSessions.attachCloser(session.id, async () => {
                if (contentInfo && lastMpvSnapshot) {
                    broadcastProgressToAngular(lastMpvSnapshot, contentInfo, request, true);
                }
                if (!proc.killed) proc.kill();
            });

            if (socketPath) {
                startPositionPolling(socketPath, contentInfo ?? { playlistId: '', contentXtreamId: 0, contentType: 'vod' }, session.id, request, (snap) => {
                    lastMpvSnapshot = snap;
                });
            }

            proc.on('error', (err) => {
                mpvProcess = null; mpvSocketPath = null; stopPositionPolling();
                externalPlayerSessions.markError(session.id, `Failed to start MPV player: ${err.message}`);
                rejectSpawn(buildPlayerStartError('MPV', err, mpvLaunchContext));
            });

            proc.on('exit', () => {
                if (contentInfo && lastMpvSnapshot) {
                    broadcastProgressToAngular(lastMpvSnapshot, contentInfo, request, true);
                }
                mpvProcess = null; mpvSocketPath = null; stopPositionPolling();
                externalPlayerSessions.markClosed(session.id);
            });

            if (!reuseInstance) proc.unref();
        });

        return externalPlayerSessions.markOpened(session.id) ?? session;
    } catch (error) {
        externalPlayerSessions.markError(session.id, error instanceof Error ? error.message : String(error));
        throw error;
    }
}