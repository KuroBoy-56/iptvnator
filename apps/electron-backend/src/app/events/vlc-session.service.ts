import { ChildProcess, spawn } from 'child_process';
import { AddressInfo, createServer } from 'net';
import * as path from 'path';
import * as fs from 'fs';
import { BrowserWindow } from 'electron';
import { PlayerContentInfo } from '@iptvnator/shared/interfaces';
import {
    VLC_PLAYER_ARGUMENTS,
    VLC_PLAYER_PATH,
    VLC_REUSE_INSTANCE,
    store,
} from '../services/store.service';
import {
    buildExternalPlayerSpawnSpec,
    buildPlayerArgsWithCustomArguments,
    getDefaultVlcPath,
    isRunningInFlatpak,
    normalizeCustomPlayerPath,
    PlayerPathOptions,
    resolveExternalPlayerLaunchContext,
    shouldReuseVlcInstance,
} from './external-player-launch-context';
import { resolveEffectiveExternalPlaybackRequest } from './external-player-playback-request';
import {
    buildPlayerStartError,
    ExternalPlaybackSnapshot,
    externalPlayerSessions,
    sendPlaybackPositionUpdate,
    traceExternalPlayer,
} from './external-player-runtime';

export interface OpenVlcPlayerRequest {
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

let vlcProcess: ChildProcess | null = null;
let vlcHttpPort: number | null = null;
let vlcPollingInterval: NodeJS.Timeout | null = null;

function getVlcPath(options: PlayerPathOptions = {}): string {
    const customPath = normalizeCustomPlayerPath(store.get(VLC_PLAYER_PATH));
    if (customPath) return customPath;

    try {
        const isWin = process.platform === 'win32';
        const localVlcName = isWin ? 'vlc.exe' : 'vlc';
        const localBinPath = path.join(process.cwd(), 'bin', 'vlc', localVlcName);
        const localResourcesPath = process.resourcesPath ? path.join(process.resourcesPath, 'bin', 'vlc', localVlcName) : localBinPath;

        if (fs.existsSync(localResourcesPath)) return localResourcesPath;
        if (fs.existsSync(localBinPath)) return localBinPath;
    } catch(e) {}

    return getDefaultVlcPath(options);
}

function broadcastProgressToAngular(
    snapshot: ExternalPlaybackSnapshot, 
    contentInfo: PlayerContentInfo, 
    request: OpenVlcPlayerRequest,
    isClosed = false
) {
    try {
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
                        thumbnail: request.thumbnail || '',
                        type: contentInfo.contentType === 'vod' ? 'movie' : contentInfo.contentType === 'episode' ? 'series' : 'live',
                        id: String(contentInfo.contentXtreamId),
                        categoryId: contentInfo.seriesXtreamId ? String(contentInfo.seriesXtreamId) : '0',
                        playlistId: contentInfo.playlistId,
                        seasonNumber: (contentInfo as any).seasonNumber || '1',
                        forcedHash: 'bad90e6f3a74f4aeab6ccee156c1726d'
                    }
                });
            }
        });
    } catch(e) {}
}

function stopVlcPositionPolling(): void {
    if (vlcPollingInterval) {
        clearInterval(vlcPollingInterval);
        vlcPollingInterval = null;
    }
}

function startVlcHttpPolling(
    port: number,
    contentInfo: PlayerContentInfo,
    sessionId: string,
    request: OpenVlcPlayerRequest,
    onSnapshot?: (snapshot: ExternalPlaybackSnapshot) => void,
    onStopped?: () => void
): void {
    stopVlcPositionPolling();

    const vlcAuth = Buffer.from(':iptvnator').toString('base64');
    let hasForcedSeek = false;

    let safeStartTime = request.startTime;
    if (safeStartTime && safeStartTime > 1000000) {
        safeStartTime = 0;
    }

    vlcPollingInterval = setInterval(async () => {
        try {
            if (!hasForcedSeek && safeStartTime && safeStartTime > 0) {
                hasForcedSeek = true;
                await fetch(`http://127.0.0.1:${port}/requests/status.json?command=seek&val=${Math.floor(safeStartTime)}`, {
                    headers: { 'Authorization': `Basic ${vlcAuth}` }
                });
            }

            const response = await fetch(`http://127.0.0.1:${port}/requests/status.json`, {
                headers: { 'Authorization': `Basic ${vlcAuth}` }
            });
            const data = await response.json();
            
            if (data && typeof data.time === 'number') {
                const snapshot: ExternalPlaybackSnapshot = {
                    positionSeconds: data.time,
                    durationSeconds: data.length > 0 ? data.length : null,
                };
                
                if (data.state === 'stopped') {
                    onStopped?.();
                    stopVlcPositionPolling();
                } else if (data.time > 0) {
                    onSnapshot?.(snapshot);
                    sendPlaybackPositionUpdate(sessionId, contentInfo, snapshot);
                    broadcastProgressToAngular(snapshot, contentInfo, request, false);
                }
            }
        } catch(e) {
        }
    }, 2000);
}

function getFreePort(): Promise<number> {
    return new Promise((resolve, reject) => {
        const server = createServer();
        server.unref();
        server.on('error', reject);
        server.listen(0, '127.0.0.1', () => {
            const address = server.address() as AddressInfo;
            const port = address.port;
            server.close(() => resolve(port));
        });
    });
}

function killStoredVlcProcess(reason: string): void {
    if (!vlcProcess || vlcProcess.killed) return;
    traceExternalPlayer(reason);
    vlcProcess.kill();
    vlcProcess = null;
    vlcHttpPort = null;
    stopVlcPositionPolling();
}

export function setVlcReuseInstance(reuseInstance: boolean): void {
    store.set(VLC_REUSE_INSTANCE, reuseInstance);
    if (!reuseInstance) killStoredVlcProcess('clean up vlc process after disabling reuse');
}

export function shutdownVlcSession(): void {
    killStoredVlcProcess('kill reused vlc process on app shutdown');
}

export async function openVlcPlayer(request: OpenVlcPlayerRequest) {
    const { url, title, thumbnail, userAgent, referer, origin, contentInfo, startTime, headers } = request;
    
    const session = externalPlayerSessions.beginSession({
        player: 'vlc', title, thumbnail, streamUrl: url, contentInfo,
    });

    try {
        const isFlatpak = isRunningInFlatpak();
        const vlcLaunchContext = resolveExternalPlayerLaunchContext('vlc', getVlcPath({ isFlatpak }), { isFlatpak });
        const customVlcArguments = store.get(VLC_PLAYER_ARGUMENTS, '');
        const reuseInstance = shouldReuseVlcInstance(store.get(VLC_REUSE_INSTANCE, false), isFlatpak);
        const { effectiveReferer, effectiveUserAgent } = resolveEffectiveExternalPlaybackRequest({ url, userAgent, referer, origin, headers });

        if (reuseInstance && vlcProcess && !vlcProcess.killed && vlcHttpPort) {
        }

        let httpPort = 0;
        if (contentInfo || reuseInstance) { try { httpPort = await getFreePort(); } catch (e) {} }

        const args: string[] = ['--no-qt-privacy-ask', '--no-qt-updates-notif'];

        if (httpPort > 0) {
            args.push('--extraintf=http');
            args.push(`--http-port=${httpPort}`);
            args.push(`--http-password=iptvnator`);
        }

        if (effectiveUserAgent) args.push(`:http-user-agent=${effectiveUserAgent}`);
        if (effectiveReferer) args.push(`:http-referrer=${effectiveReferer}`);
        if (origin && !effectiveReferer) args.push(`:http-referrer=${origin}`);
        
        let safeStartTime = startTime;
        if (safeStartTime && safeStartTime > 1000000) {
            safeStartTime = 0;
        }

        if (safeStartTime && safeStartTime > 0) args.push(`--start-time=${Math.floor(safeStartTime)}`);
        
        args.push(url);
        if (title) args.push(`:meta-title=${title}`);

        let lastVlcSnapshot: ExternalPlaybackSnapshot | null = null;

        await new Promise<void>((resolve, reject) => {
            let settled = false;
            const resolveSpawn = () => { if (settled) return; settled = true; resolve(); };
            const rejectSpawn = (error: Error) => { if (settled) return; settled = true; reject(error); };

            const spawnSpec = buildExternalPlayerSpawnSpec(vlcLaunchContext, buildPlayerArgsWithCustomArguments(customVlcArguments, args));
            
            const proc = spawn(spawnSpec.command, spawnSpec.args, {
                shell: false, 
                detached: !reuseInstance, 
                stdio: 'ignore' 
            });

            proc.once('spawn', resolveSpawn);
            setTimeout(resolveSpawn, 300);

            if (httpPort > 0) {
                vlcProcess = proc;
                vlcHttpPort = httpPort;
            }

            const markVlcSessionClosed = () => {
                if (externalPlayerSessions.getSession(session.id)?.status === 'closed') return;
                if (lastVlcSnapshot && contentInfo) {
                    sendPlaybackPositionUpdate(session.id, contentInfo, lastVlcSnapshot);
                    broadcastProgressToAngular(lastVlcSnapshot, contentInfo, request, true);
                }
                externalPlayerSessions.markClosed(session.id);
            };

            externalPlayerSessions.attachCloser(session.id, async () => {
                if (lastVlcSnapshot && contentInfo) {
                    sendPlaybackPositionUpdate(session.id, contentInfo, lastVlcSnapshot);
                    broadcastProgressToAngular(lastVlcSnapshot, contentInfo, request, true);
                }
                if (!proc.killed) proc.kill();
            });

            if (httpPort > 0 && contentInfo) {
                startVlcHttpPolling(httpPort, contentInfo, session.id, request, 
                    (snapshot) => { lastVlcSnapshot = snapshot; },
                    () => markVlcSessionClosed()
                );
            }

            proc.on('error', (err) => {
                if (vlcProcess === proc) { vlcProcess = null; vlcHttpPort = null; }
                externalPlayerSessions.markError(session.id, `Failed to start VLC: ${err.message}`);
                rejectSpawn(buildPlayerStartError('VLC', err, vlcLaunchContext));
            });

            proc.on('exit', () => {
                if (vlcProcess === proc) { vlcProcess = null; vlcHttpPort = null; }
                stopVlcPositionPolling();

                if (lastVlcSnapshot && contentInfo && externalPlayerSessions.getSession(session.id)?.status !== 'closed') {
                    sendPlaybackPositionUpdate(session.id, contentInfo, lastVlcSnapshot);
                    broadcastProgressToAngular(lastVlcSnapshot, contentInfo, request, true);
                }
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