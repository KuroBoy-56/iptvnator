// @ts-nocheck
import { ipcMain } from 'electron';
import { CLOSE_EXTERNAL_PLAYER_SESSION, PlayerContentInfo, ExternalPlayerSession } from '@iptvnator/shared/interfaces';
import { MPV_PLAYER_PATH, store, VLC_PLAYER_PATH } from '../services/store.service';
import { normalizePlayerPathForStore, resolveExternalPlayerLaunchContext } from './external-player-launch-context';
import { externalPlayerSessions } from './external-player-runtime';

import { openMpvPlayer, setMpvReuseInstance } from './mpv-session.service';
import { openVlcPlayer, setVlcReuseInstance } from './vlc-session.service';

export { buildExternalPlayerSpawnSpec, buildPlayerArgsWithCustomArguments, isRunningInFlatpak, parseExternalPlayerArguments, resolveExternalPlayerLaunchContext, shouldReuseMpvInstance, shouldReuseVlcInstance, shouldUseMpvSocketBridge } from './external-player-launch-context';
export { buildVlcEnqueueCommands, parseVlcRcNumericResponse, parseVlcRcPlaybackState } from './vlc-session.service';

export default class PlayerEvents {
    static bootstrapPlayerEvents(): Electron.IpcMain { 
        
        ipcMain.handle('OPEN_MPV_PLAYER', async (_event, urlOrObj, title, thumbnail, userAgent, referer, origin, contentInfo, startTime, headers) => {
            let request: any = {};
            if (typeof urlOrObj === 'object' && urlOrObj !== null) {
                request = urlOrObj;
            } else {
                request = { url: urlOrObj, title, thumbnail, userAgent, referer, origin, contentInfo, startTime, headers };
            }
            return await openMpvPlayer(request);
        });

        ipcMain.handle('SET_MPV_PLAYER_PATH', (_event, mpvPlayerPath) => {
            store.set(MPV_PLAYER_PATH, normalizePlayerPathForStore(mpvPlayerPath));
        });
        
        ipcMain.handle('SET_MPV_REUSE_INSTANCE', (_event, reuseInstance) => {
            setMpvReuseInstance(reuseInstance);
        });

        ipcMain.handle('OPEN_VLC_PLAYER', async (_event, urlOrObj, title, thumbnail, userAgent, referer, origin, contentInfo, startTime, headers) => {
            let request: any = {};
            if (typeof urlOrObj === 'object' && urlOrObj !== null) {
                request = urlOrObj;
            } else {
                request = { url: urlOrObj, title, thumbnail, userAgent, referer, origin, contentInfo, startTime, headers };
            }
            return await openVlcPlayer(request);
        });

        ipcMain.handle('SET_VLC_PLAYER_PATH', (_event, vlcPlayerPath) => { 
            store.set(VLC_PLAYER_PATH, normalizePlayerPathForStore(vlcPlayerPath)); 
        });
        
        ipcMain.handle('SET_VLC_REUSE_INSTANCE', (_event, reuseInstance) => { 
            setVlcReuseInstance(reuseInstance); 
        });
        
        ipcMain.handle(CLOSE_EXTERNAL_PLAYER_SESSION, async (_event, sessionId) => {
            return externalPlayerSessions.closeSession(sessionId);
        });

        return ipcMain;
    }
}