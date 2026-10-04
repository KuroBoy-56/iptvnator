import { Component, inject, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Store } from '@ngrx/store';
import { firstValueFrom } from 'rxjs';
import { PlaylistActions, selectAllPlaylistsMeta } from '@iptvnator/m3u-state';
import { PortalStatusService, PlaylistDeleteActionService } from '@iptvnator/services';
import { normalizeXtreamServerUrl, Playlist } from '@iptvnator/shared/interfaces';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { v4 as uuid } from 'uuid';
import { PanelSyncService } from '@iptvnator/services';

function generateKuroToken(): string {
    const date = new Date();
    const y = date.getUTCFullYear();
    const m = String(date.getUTCMonth() + 1).padStart(2, '0');
    const d = String(date.getUTCDate()).padStart(2, '0');
    const dateStr = `${y}-${m}-${d}`;

    const map: any = {'0':'cero-', '1':'uno-', '2':'dos-', '3':'tres-', '4':'cuatro-', '5':'cinco-', '6':'seis-', '7':'siete-', '8':'ocho-', '9':'nueve-', '-':''};
    let str = '';
    for (let i = 0; i < dateStr.length; i++) {
        str += map[dateStr[i]];
    }
    str = str.replace(/-$/, '');
    const finalString = str + '-kuro';

    function md5Hex(string: string): string {
        function rotateLeft(lValue: number, iShiftBits: number) { return (lValue << iShiftBits) | (lValue >>> (32 - iShiftBits)); }
        function addUnsigned(lX: number, lY: number) {
            let lX4 = (lX & 0x40000000), lY4 = (lY & 0x40000000), lX8 = (lX & 0x80000000), lY8 = (lY & 0x80000000);
            let lResult = (lX & 0x3FFFFFFF) + (lY & 0x3FFFFFFF);
            if (lX4 & lY4) return (lResult ^ 0x80000000 ^ lX8 ^ lY8);
            if (lX4 | lY4) { if (lResult & 0x40000000) return (lResult ^ 0xC0000000 ^ lX8 ^ lY8); else return (lResult ^ 0x40000000 ^ lX8 ^ lY8); }
            else return (lResult ^ lX8 ^ lY8);
        }
        function F(x: number, y: number, z: number) { return (x & y) | ((~x) & z); }
        function G(x: number, y: number, z: number) { return (x & z) | (y & (~z)); }
        function H(x: number, y: number, z: number) { return (x ^ y ^ z); }
        function I(x: number, y: number, z: number) { return (y ^ (x | (~z))); }
        function FF(a: number, b: number, c: number, d: number, x: number, s: number, ac: number) { a = addUnsigned(a, addUnsigned(addUnsigned(F(b, c, d), x), ac)); return addUnsigned(rotateLeft(a, s), b); }
        function GG(a: number, b: number, c: number, d: number, x: number, s: number, ac: number) { a = addUnsigned(a, addUnsigned(addUnsigned(G(b, c, d), x), ac)); return addUnsigned(rotateLeft(a, s), b); }
        function HH(a: number, b: number, c: number, d: number, x: number, s: number, ac: number) { a = addUnsigned(a, addUnsigned(addUnsigned(H(b, c, d), x), ac)); return addUnsigned(rotateLeft(a, s), b); }
        function II(a: number, b: number, c: number, d: number, x: number, s: number, ac: number) { a = addUnsigned(a, addUnsigned(addUnsigned(I(b, c, d), x), ac)); return addUnsigned(rotateLeft(a, s), b); }
        let x = Array();
        let k, AA, BB, CC, DD, a, b, c, d;
        let S11=7, S12=12, S13=17, S14=22, S21=5, S22=9 , S23=14, S24=20, S31=4, S32=11, S33=16, S34=23, S41=6, S42=10, S43=15, S44=21;
        string = unescape(encodeURIComponent(string));
        let lMessageLength = string.length, lNumberOfWords_temp1 = lMessageLength + 8, lNumberOfWords_temp2 = (lNumberOfWords_temp1 - (lNumberOfWords_temp1 % 64)) / 64, lNumberOfWords = (lNumberOfWords_temp2 + 1) * 16, lWordArray = Array(lNumberOfWords - 1), lBytePosition = 0, lByteCount = 0;
        while (lByteCount < lMessageLength) { let lWordCount = (lByteCount - (lByteCount % 4)) / 4; lBytePosition = (lByteCount % 4) * 8; lWordArray[lWordCount] = (lWordArray[lWordCount] | (string.charCodeAt(lByteCount) << lBytePosition)); lByteCount++; }
        let lWordCount = (lByteCount - (lByteCount % 4)) / 4; lBytePosition = (lByteCount % 4) * 8; lWordArray[lWordCount] = lWordArray[lWordCount] | (0x80 << lBytePosition); lWordArray[lNumberOfWords - 2] = lMessageLength << 3; lWordArray[lNumberOfWords - 1] = lMessageLength >>> 29;
        x = lWordArray; a = 0x67452301; b = 0xEFCDAB89; c = 0x98BADCFE; d = 0x10325476;
        for (k = 0; k < x.length; k += 16) {
            AA = a; BB = b; CC = c; DD = d;
            a = FF(a, b, c, d, x[k+0], S11, 0xD76AA478); d = FF(d, a, b, c, x[k+1], S12, 0xE8C7B756); c = FF(c, d, a, b, x[k+2], S13, 0x242070DB); b = FF(b, c, d, a, x[k+3], S14, 0xC1BDCEEE);
            a = FF(a, b, c, d, x[k+4], S11, 0xF57C0FAF); d = FF(d, a, b, c, x[k+5], S12, 0x4787C62A); c = FF(c, d, a, b, x[k+6], S13, 0xA8304613); b = FF(b, c, d, a, x[k+7], S14, 0xFD469501);
            a = FF(a, b, c, d, x[k+8], S11, 0x698098D8); d = FF(d, a, b, c, x[k+9], S12, 0x8B44F7AF); c = FF(c, d, a, b, x[k+10], S13, 0xFFFF5BB1); b = FF(b, c, d, a, x[k+11], S14, 0x895CD7BE);
            a = FF(a, b, c, d, x[k+12], S11, 0x6B901122); d = FF(d, a, b, c, x[k+13], S12, 0xFD987193); c = FF(c, d, a, b, x[k+14], S13, 0xA679438E); b = FF(b, c, d, a, x[k+15], S14, 0x49B40821);
            a = GG(a, b, c, d, x[k+1], S21, 0xF61E2562); d = GG(d, a, b, c, x[k+6], S22, 0xC040B340); c = GG(c, d, a, b, x[k+11], S23, 0x265E5A51); b = GG(b, c, d, a, x[k+0], S24, 0xE9B6C7AA);
            a = GG(a, b, c, d, x[k+5], S21, 0xD62F105D); d = GG(d, a, b, c, x[k+10], S22, 0x2441453); c = GG(c, d, a, b, x[k+15], S23, 0xD8A1E681); b = GG(b, c, d, a, x[k+4], S24, 0xE7D3FBC8);
            a = GG(a, b, c, d, x[k+9], S21, 0x21E1CDE6); d = GG(d, a, b, c, x[k+14], S22, 0xC33707D6); c = GG(c, d, a, b, x[k+3], S23, 0xF4D50D87); b = GG(b, c, d, a, x[k+8], S24, 0x455A14ED);
            a = GG(a, b, c, d, x[k+13], S21, 0xA9E3E905); d = GG(d, a, b, c, x[k+2], S22, 0xFCEFA3F8); c = GG(c, d, a, b, x[k+7], S23, 0x676F02D9); b = GG(b, c, d, a, x[k+12], S24, 0x8D2A4C8A);
            a = HH(a, b, c, d, x[k+5], S31, 0xFFFA3942); d = HH(d, a, b, c, x[k+8], S32, 0x8771F681); c = HH(c, d, a, b, x[k+11], S33, 0x6D9D6122); b = HH(b, c, d, a, x[k+14], S34, 0xFDE5380C);
            a = HH(a, b, c, d, x[k+1], S31, 0xA4BEEA44); d = HH(d, a, b, c, x[k+4], S32, 0x4BDECFA9); c = HH(c, d, a, b, x[k+7], S33, 0xF6BB4B60); b = HH(b, c, d, a, x[k+10], S34, 0xBEBFBC70);
            a = HH(a, b, c, d, x[k+13], S31, 0x289B7EC6); d = HH(d, a, b, c, x[k+0], S32, 0xEAA127FA); c = HH(c, d, a, b, x[k+3], S33, 0xD4EF3085); b = HH(b, c, d, a, x[k+6], S34, 0x4881D05);
            a = HH(a, b, c, d, x[k+9], S31, 0xD9D4D039); d = HH(d, a, b, c, x[k+12], S32, 0xE6DB99E5); c = HH(c, d, a, b, x[k+15], S33, 0x1FA27CF8); b = HH(b, c, d, a, x[k+2], S34, 0xC4AC5665);
            a = II(a, b, c, d, x[k+0], S41, 0xF4292244); d = II(d, a, b, c, x[k+7], S42, 0x432AFF97); c = II(c, d, a, b, x[k+14], S43, 0xAB9423A7); b = II(b, c, d, a, x[k+5], S44, 0xFC93A039);
            a = II(a, b, c, d, x[k+12], S41, 0x655B59C3); d = II(d, a, b, c, x[k+3], S42, 0x8F0CCC92); c = II(c, d, a, b, x[k+10], S43, 0xFFEFF47D); b = II(b, c, d, a, x[k+1], S44, 0x85845DD1);
            a = II(a, b, c, d, x[k+8], S41, 0x6FA87E4F); d = II(d, a, b, c, x[k+15], S42, 0xFE2CE6E0); c = II(c, d, a, b, x[k+6], S43, 0xA3014314); b = II(b, c, d, a, x[k+13], S44, 0x4E0811A1);
            a = II(a, b, c, d, x[k+4], S41, 0xF7537E82); d = II(d, a, b, c, x[k+11], S42, 0xBD3AF235); c = II(c, d, a, b, x[k+2], S43, 0x2AD7D2BB); b = II(b, c, d, a, x[k+9], S44, 0xEB86D391);
            a = addUnsigned(a, AA); b = addUnsigned(b, BB); c = addUnsigned(c, CC); d = addUnsigned(d, DD);
        }
        function wordToHex(lValue: number) { let WordToHexValue = "", WordToHexValue_temp = "", lByte, lCount; for (lCount = 0; lCount <= 3; lCount++) { lByte = (lValue >>> (lCount * 8)) & 255; WordToHexValue_temp = "0" + lByte.toString(16); WordToHexValue = WordToHexValue + WordToHexValue_temp.substr(WordToHexValue_temp.length - 2, 2); } return WordToHexValue; }
        return (wordToHex(a) + wordToHex(b) + wordToHex(c) + wordToHex(d)).toLowerCase();
    }

    const hex = md5Hex(finalString);
    let binary = '';
    for (let i = 0; i < hex.length; i += 2) {
        binary += String.fromCharCode(parseInt(hex.substr(i, 2), 16));
    }
    return btoa(binary);
}

@Component({
    standalone: true,
    selector: 'app-login',
    templateUrl: './login.component.html',
    styleUrls: ['./login.component.scss'],
    imports: [CommonModule, FormsModule]
})
export class LoginComponent implements OnInit {
    isLoading = true; 
    isPasswordVisible = false;
    isDemoPanelOpen = false;
    errorMessage: string | null = null; 
    isSuccessMessage = false;

    currentDns: string = 'off';

    private readonly http = inject(HttpClient);
    private readonly store = inject(Store);
    private readonly router = inject(Router);
    private readonly portalStatusService = inject(PortalStatusService);
    private readonly playlistDeleteAction = inject(PlaylistDeleteActionService);
    private readonly panelSync = inject(PanelSyncService);

    private checkDRM(serverToken: string | undefined): boolean {
        if (!serverToken) {
            localStorage.setItem('DRM_LOCKED', 'true');
            return false;
        }
        const localToken = generateKuroToken();
        if (serverToken === localToken) {
            localStorage.setItem('DRM_LOCKED', 'false');
            return true;
        }
        localStorage.setItem('DRM_LOCKED', 'true');
        return false;
    }

    private normalizeStr(str: string | undefined): string {
        return str ? str.trim().toLowerCase() : '';
    }

    private normalizeUrl(url: string | undefined): string {
        return url ? normalizeXtreamServerUrl(url).trim().replace(/\/+$/, '').toLowerCase() : '';
    }

    async ngOnInit() {
        this.currentDns = localStorage.getItem('secure_dns') || 'off';
        this.applyDns(this.currentDns);

        const targetUrl = this.getApiUrl();
        const macAddress = await this.getPcMacAddress();

        try {
            const autoResponse = await firstValueFrom(
                this.http.post<any>(
                    targetUrl,
                    { action: 'auto_login', mac_address: macAddress, device_id: macAddress }
                )
            );

            let validAccounts: any[] = [];
            if (autoResponse && autoResponse.success && autoResponse.accounts) {
                validAccounts = autoResponse.accounts;
            }

            const initialPlaylists = await firstValueFrom(this.store.select(selectAllPlaylistsMeta));
            for (const p of initialPlaylists) {
                if (!p.serverUrl) continue;
                
                const stillActive = validAccounts.find((a: any) => 
                    this.normalizeStr(a.username) === this.normalizeStr(p.username) && 
                    this.normalizeStr(a.password) === this.normalizeStr(p.password) &&
                    this.normalizeUrl(a.dns) === this.normalizeUrl(p.serverUrl)
                );

                if (!stillActive) {
                    await this.playlistDeleteAction.deletePlaylist(p);
                    this.store.dispatch(PlaylistActions.removePlaylist({ playlistId: p._id }));
                    localStorage.removeItem(`is_demo_${p._id}`);
                }
            }

            if (autoResponse && autoResponse.success && autoResponse.accounts && autoResponse.accounts.length > 0) {
                
                const isSecure = this.checkDRM(autoResponse.drm_token);
                if (!isSecure) {
                    this.errorMessage = "Fallo de conexión crítico. Servidor en mantenimiento.";
                    this.isLoading = false;
                    return;
                }

                const alertAccounts = [];
                let hasChanges = false;
                
                const updatedPlaylists = await firstValueFrom(this.store.select(selectAllPlaylistsMeta));
                let lastTargetId = '';

                for (const acc of autoResponse.accounts) {
                    const serverUrl = normalizeXtreamServerUrl(acc.dns).trim(); 
                    
                    const existingPlaylist = updatedPlaylists.find(p => 
                        this.normalizeStr(p.username) === this.normalizeStr(acc.username) && 
                        this.normalizeStr(p.password) === this.normalizeStr(acc.password) &&
                        this.normalizeUrl(p.serverUrl) === this.normalizeUrl(serverUrl)
                    );

                    let currentPlaylistId = existingPlaylist ? existingPlaylist._id : null;

                    if (!existingPlaylist) {
                        const newPlaylistId = uuid();
                        currentPlaylistId = newPlaylistId;
                        if (acc.title === 'DEMO') {
                            localStorage.setItem(`is_demo_${newPlaylistId}`, 'true');
                        }

                        this.store.dispatch(
                            PlaylistActions.addPlaylist({
                                playlist: {
                                    _id: newPlaylistId,
                                    title: acc.title || 'LatMpx Pro+',
                                    username: acc.username?.trim(),
                                    password: acc.password?.trim(),
                                    serverUrl: serverUrl,
                                    importDate: new Date().toISOString(),
                                    type: 'xtream' 
                                } as any,
                            })
                        );
                        hasChanges = true;
                    } else {
                        const finalTitle = acc.title || 'LatMpx Pro+';
                        if (existingPlaylist.title !== finalTitle) {
                            this.store.dispatch(
                                PlaylistActions.updatePlaylistMeta({
                                    playlist: {
                                        _id: existingPlaylist._id,
                                        title: finalTitle
                                    } as any
                                })
                            );
                        }
                    }
                    
                    lastTargetId = currentPlaylistId || '';
                    alertAccounts.push({
                        user: acc.username?.trim(),
                        pass: acc.password?.trim(),
                        dns: serverUrl,
                        title: acc.title || 'Aviso de Vencimiento'
                    });
                }

                if (alertAccounts.length > 0) {
                    localStorage.setItem('alert_accounts', JSON.stringify(alertAccounts));
                }

                const activeAccount = autoResponse.accounts[0];
                const sessionToken = autoResponse.token || 'token-' + uuid();
                localStorage.setItem('session_token', sessionToken);
                localStorage.setItem('session_date', new Date().getTime().toString());
                localStorage.setItem('session_user', activeAccount.username.trim());
                localStorage.setItem('session_pass', activeAccount.password.trim());
                
                const resolvedSessionServer = normalizeXtreamServerUrl(activeAccount.dns).trim();
                localStorage.setItem('session_server', resolvedSessionServer);

                if (lastTargetId) {
                    try {
                        const userIdObj = { username: activeAccount.username, password: activeAccount.password, server: resolvedSessionServer };
                        const baseUrl = resolvedSessionServer.trim().replace(/\/+$/, '');
                        const win = window as any;
                        const ipc = win.electron?.ipcRenderer;
                        
                        const liveUrl = `${baseUrl}/player_api.php?username=${activeAccount.username}&password=${activeAccount.password}&action=get_live_streams`;
                        const liveResp = await fetch(liveUrl).then(r => r.json()).catch(() => null);
                        if (Array.isArray(liveResp)) {
                            const liveMap = new Map();
                            for (const ch of liveResp) {
                                liveMap.set(String(ch.stream_id), { name: ch.name, logo: ch.stream_icon, category_id: ch.category_id });
                            }
                            win.__liveChannelsCache = win.__liveChannelsCache || {};
                            win.__liveChannelsCache[lastTargetId] = liveMap;
                        }

                        if (ipc) {
                            const [cloudProgress, cloudFavorites]: any[] = await Promise.all([
                                this.panelSync.getAllProgress(userIdObj),
                                this.panelSync.getAllFavorites(userIdObj)
                            ]);
                            
                            if (cloudProgress) {
                                const processCloud = async (fbType: string, dbType: string) => {
                                    if (cloudProgress[fbType]) {
                                        for (const catId of Object.keys(cloudProgress[fbType])) {
                                            const items = fbType === 'Series' ? cloudProgress[fbType][catId] : { [catId]: cloudProgress[fbType][catId] };
                                            const cId = fbType === 'Series' ? catId : undefined;
                                            
                                            for (const itemId of Object.keys(items)) {
                                                const data = items[itemId];
                                                if (data && (data.timeline > 0 || data.timestamp || data.showInContinueWatchingList)) {
                                                    const targetLookupId = cId ? Number(cId) : Number(itemId);
                                                    
                                                    let realTitle = data.title && data.title !== 'null' ? data.title : undefined;
                                                    let realPoster = data.thumbnail && data.thumbnail !== 'null' ? data.thumbnail : undefined;

                                                    if (!realTitle || !realPoster) {
                                                        try {
                                                            const content = await ipc.invoke('DB_GET_CONTENT_BY_XTREAM_ID', {
                                                                xtreamId: targetLookupId,
                                                                playlistId: lastTargetId,
                                                                contentType: dbType
                                                            });
                                                            const realContent = Array.isArray(content) ? content[0] : content;
                                                            if (realContent) {
                                                                realTitle = realTitle || realContent.title;
                                                                realPoster = realPoster || realContent.poster_url || realContent.backdrop_url;
                                                            }
                                                        } catch(e) {}
                                                    }

                                                    if (!realTitle || !realPoster) {
                                                        try {
                                                            const action = fbType === 'Series' ? 'get_series_info&series_id=' : 'get_vod_info&vod_id=';
                                                            const url = `${baseUrl}/player_api.php?username=${activeAccount.username}&password=${activeAccount.password}&action=${action}${targetLookupId}`;
                                                            const resp = await fetch(url).then(r => r.json());
                                                            if (resp) {
                                                                if (fbType === 'Series' && resp.info) {
                                                                    realTitle = realTitle || resp.info.name;
                                                                    realPoster = realPoster || resp.info.cover || resp.info.backdrop_path?.[0];
                                                                } else if (resp.movie_data || resp.info) {
                                                                    realTitle = realTitle || resp.movie_data?.name || resp.info?.name || resp.info?.movie_name;
                                                                    realPoster = realPoster || resp.movie_data?.poster || resp.info?.movie_image || resp.info?.cover;
                                                                }
                                                            }
                                                        } catch(e) {}
                                                    }

                                                    await ipc.invoke('DB_SAVE_PLAYBACK_POSITION', {
                                                        playlistId: lastTargetId,
                                                        data: {
                                                            contentXtreamId: Number(itemId),
                                                            contentType: dbType,
                                                            seriesXtreamId: cId ? Number(cId) : undefined,
                                                            positionSeconds: data.timeline || 0,
                                                            durationSeconds: data.duration || (data.timeline ? data.timeline * 1.25 : 0),
                                                            title: realTitle || 'Contenido',
                                                            poster: realPoster || ''
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
                                                try {
                                                    let realPoster = thumb && thumb !== 'null' ? thumb : undefined;
                                                    
                                                    if (!realPoster) {
                                                        if (type === 'LiveTv' && win.__liveChannelsCache?.[lastTargetId]) {
                                                            const liveInfo = win.__liveChannelsCache[lastTargetId].get(String(itemId));
                                                            if (liveInfo) realPoster = liveInfo.logo;
                                                        } else {
                                                            const cType = type === 'Series' ? 'series' : 'movie';
                                                            const content = await ipc.invoke('DB_GET_CONTENT_BY_XTREAM_ID', {
                                                                xtreamId: Number(itemId),
                                                                playlistId: lastTargetId,
                                                                contentType: cType
                                                            });
                                                            const realContent = Array.isArray(content) ? content[0] : content;
                                                            if (realContent) {
                                                                realPoster = realContent.poster_url || realContent.backdrop_url;
                                                            } else {
                                                                const action = type === 'Series' ? 'get_series_info&series_id=' : 'get_vod_info&vod_id=';
                                                                const url = `${baseUrl}/player_api.php?username=${activeAccount.username}&password=${activeAccount.password}&action=${action}${itemId}`;
                                                                const resp = await fetch(url).then(r => r.json());
                                                                if (resp) {
                                                                    if (type === 'Series' && resp.info) {
                                                                        realPoster = resp.info.cover || resp.info.backdrop_path?.[0];
                                                                    } else if (resp.movie_data || resp.info) {
                                                                        realPoster = resp.movie_data?.poster || resp.info?.movie_image || resp.info?.cover;
                                                                    }
                                                                }
                                                            }
                                                        }
                                                    }

                                                    await ipc.invoke('DB_ADD_FAVORITE', {
                                                        contentId: Number(itemId),
                                                        playlistId: lastTargetId,
                                                        backdropUrl: realPoster || undefined
                                                    });
                                                } catch(e) {}
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    } catch(e) {}
                }

                setTimeout(async () => {
                    const navExitoso = await this.router.navigate(['/workspace']);
                    if (!navExitoso) {
                        this.isLoading = false;
                    }
                }, hasChanges ? 1200 : 800);

            } else {
                if (autoResponse?.message) {
                    this.errorMessage = autoResponse.message;
                }
                this.isLoading = false;
            }
        } catch (error) {
            this.isLoading = false;
        }
    }

    private getApiUrl(): string {
        const encrypted = [3, 1, 6, 31, 24, 79, 93, 64, 12, 20, 0, 10, 29, 12, 28, 31, 10, 27, 23, 3, 24, 91, 30, 14, 31, 24, 2, 23, 69, 22, 29, 2, 68, 5, 30, 14, 18, 16, 0, 48, 27, 22, 45, 14, 27, 28, 92, 31, 3, 5];
        const key = "kuro";
        let decrypted = "";
        for (let i = 0; i < encrypted.length; i++) {
            decrypted += String.fromCharCode(encrypted[i] ^ key.charCodeAt(i % key.length));
        }
        return decrypted;
    }

    private getDemoApiUrl(): string {
        const encrypted = [3, 1, 6, 31, 24, 79, 93, 64, 12, 20, 0, 10, 29, 12, 28, 31, 10, 27, 23, 3, 24, 91, 30, 14, 31, 24, 2, 23, 69, 22, 29, 2, 68, 28, 16, 0, 95, 30, 2, 29, 4, 90, 19, 31, 2, 90, 22, 10, 6, 26, 45, 31, 25, 26, 10, 22, 52, 5, 17, 65, 27, 29, 2];
        const key = "kuro";
        let decrypted = "";
        for (let i = 0; i < encrypted.length; i++) {
            decrypted += String.fromCharCode(encrypted[i] ^ key.charCodeAt(i % key.length));
        }
        return decrypted;
    }

    private async getPcMacAddress(): Promise<string> {
        let deviceId = localStorage.getItem('pc_hardware_id');
        
        if (deviceId && (!deviceId.includes('PC:') || deviceId.length < 23)) {
            localStorage.removeItem('pc_hardware_id');
            deviceId = null;
        }

        if (!deviceId) {
            try {
                const win = window as any;
                if (win.electron && win.electron.getHardwareId) {
                    const realId = await win.electron.getHardwareId();
                    if (realId && realId.length >= 20) {
                        deviceId = `PC:${realId}`;
                    }
                }
            } catch (e) {}
            if (!deviceId) {
                const hex = () => Math.floor(Math.random() * 256).toString(16).padStart(2, '0').toUpperCase();
                deviceId = `PC:${hex()}.${hex()}.${hex()}.${hex()}.${hex()}.${hex()}.${hex()}.${hex()}`;
            }
            localStorage.setItem('pc_hardware_id', deviceId);
        }
        return deviceId;
    }

    toggleDns() {
        if (this.currentDns === 'off') {
            this.currentDns = 'cloudflare';
        } else if (this.currentDns === 'cloudflare') {
            this.currentDns = 'google';
        } else {
            this.currentDns = 'off';
        }
        localStorage.setItem('secure_dns', this.currentDns);
        this.applyDns(this.currentDns);
    }

    applyDns(provider: string) {
        try {
            const win = window as any;
            if (win.electron && win.electron.ipcRenderer) {
                win.electron.ipcRenderer.send('SET_SECURE_DNS', provider);
            }
        } catch (e) {}
    }

    getDnsLabel(): string {
        if (this.currentDns === 'cloudflare') return '🛡️ DNS: Cloudflare (Activo)';
        if (this.currentDns === 'google') return '🛡️ DNS: Google (Activo)';
        return '🌐 DNS Privado: Apagado';
    }

    togglePasswordVisibility(): void {
        this.isPasswordVisible = !this.isPasswordVisible;
    }

    toggleDemoPanel(): void {
        this.isDemoPanelOpen = !this.isDemoPanelOpen;
    }

    async activateDemo(codeValue: string) {
        this.errorMessage = null;
        this.isSuccessMessage = false;

        let code = '';
        if (this.isDemoPanelOpen && codeValue) {
            code = codeValue.trim();
        }

        this.isLoading = true;
        const macAddress = await this.getPcMacAddress();
        const demoUrl = this.getDemoApiUrl();
        
        try {
            const urlWithParams = `${demoUrl}?device_id=${encodeURIComponent(macAddress)}&dns_id=${encodeURIComponent(code)}`;
            const rawResponse = await firstValueFrom(
                this.http.get(urlWithParams, { responseType: 'text' })
            );

            let response;
            try {
                response = JSON.parse(rawResponse);
            } catch (e) {
                throw new Error();
            }

            if (!response || !response.success) {
                this.errorMessage = response?.message || '';
                this.isLoading = false;
                return;
            }

            this.isSuccessMessage = true;
            this.errorMessage = response.message;

            if (response.username && response.password) {
                setTimeout(async () => {
                    await this.login(response.username!, response.password!, "DEMO");
                }, 1500);
            } else {
                this.isLoading = false;
            }

        } catch (error: any) {
            if (error instanceof HttpErrorResponse) {
                this.errorMessage = `Error Status ${error.status} - ${error.statusText}`;
            } else {
                this.errorMessage = `Error: ${error.message}`;
            }
            this.isLoading = false;
        }
    }

    async login(userValue: string, passValue: string, dynamicTitle?: string) {
        this.errorMessage = null;
        this.isSuccessMessage = false;

        const user = userValue?.trim();
        const pass = passValue?.trim();

        if (!user || !pass) {
            this.errorMessage = '';
            return;
        }

        this.isLoading = true;
        const macAddress = await this.getPcMacAddress();
        const targetUrl = this.getApiUrl();

        try {
            const rawResponse = await firstValueFrom(
                this.http.post(targetUrl, 
                    { username: user, password: pass, mac_address: macAddress, device_id: macAddress },
                    { responseType: 'text' }
                )
            );

            let authResponse;
            try {
                authResponse = JSON.parse(rawResponse);
            } catch (e) {
                throw new Error();
            }

            if (!authResponse || !authResponse.success || !authResponse.dns) {
                this.errorMessage = authResponse?.message || '';
                this.isLoading = false;
                return;
            }

            const isSecure = this.checkDRM(authResponse.drm_token);
            if (!isSecure) {
                this.errorMessage = "Fallo de conexión crítico. Servidor en mantenimiento.";
                this.isLoading = false;
                return;
            }

            const resolvedServerUrl = normalizeXtreamServerUrl(authResponse.dns).trim(); 
            const finalTitle = dynamicTitle || authResponse.title || 'LatMpx Pro+';

            const connectionStatus = await this.portalStatusService.checkPortalStatus(
                resolvedServerUrl,
                user,
                pass,
                { skipCache: true }
            );

            if (connectionStatus === 'active') {
                const playlists = await firstValueFrom(this.store.select(selectAllPlaylistsMeta));
                const existingPlaylist = playlists.find(p => 
                    this.normalizeStr(p.username) === this.normalizeStr(user) && 
                    this.normalizeStr(p.password) === this.normalizeStr(pass) &&
                    this.normalizeUrl(p.serverUrl) === this.normalizeUrl(resolvedServerUrl)
                );

                const sessionToken = authResponse.token || 'token-' + uuid();
                localStorage.setItem('session_token', sessionToken);
                localStorage.setItem('session_date', new Date().getTime().toString());
                localStorage.setItem('session_user', user);
                localStorage.setItem('session_pass', pass);
                localStorage.setItem('session_server', resolvedServerUrl);

                let alertAccountsStr = localStorage.getItem('alert_accounts');
                let alertAccounts = alertAccountsStr ? JSON.parse(alertAccountsStr) : [];
                alertAccounts = alertAccounts.filter((a: any) => !(a.user === user && a.pass === pass));
                alertAccounts.push({
                    user: user,
                    pass: pass,
                    dns: resolvedServerUrl,
                    title: finalTitle
                });
                localStorage.setItem('alert_accounts', JSON.stringify(alertAccounts));

                let targetId = existingPlaylist ? existingPlaylist._id : uuid();

                if (!existingPlaylist) {
                    if (finalTitle === 'DEMO') {
                        localStorage.setItem(`is_demo_${targetId}`, 'true');
                    }
                    this.store.dispatch(
                        PlaylistActions.addPlaylist({
                            playlist: {
                                _id: targetId,
                                title: finalTitle,
                                username: user,
                                password: pass,
                                serverUrl: resolvedServerUrl,
                                importDate: new Date().toISOString(),
                                type: 'xtream' 
                            } as any,
                        })
                    );
                } else {
                    if (finalTitle === 'DEMO') {
                        localStorage.setItem(`is_demo_${targetId}`, 'true');
                    }
                    if (existingPlaylist.title !== finalTitle) {
                        this.store.dispatch(
                            PlaylistActions.updatePlaylistMeta({
                                playlist: {
                                    _id: existingPlaylist._id,
                                    title: finalTitle
                                } as any
                            })
                        );
                    }
                }

                if (targetId) {
                    try {
                        const userIdObj = { username: user, password: pass, server: resolvedServerUrl };
                        const baseUrl = resolvedServerUrl.replace(/\/+$/, '');
                        const win = window as any;
                        const ipc = win.electron?.ipcRenderer;
                        
                        const liveUrl = `${baseUrl}/player_api.php?username=${user}&password=${pass}&action=get_live_streams`;
                        const liveResp = await fetch(liveUrl).then(r => r.json()).catch(() => null);
                        if (Array.isArray(liveResp)) {
                            const liveMap = new Map();
                            for (const ch of liveResp) {
                                liveMap.set(String(ch.stream_id), { name: ch.name, logo: ch.stream_icon, category_id: ch.category_id });
                            }
                            win.__liveChannelsCache = win.__liveChannelsCache || {};
                            win.__liveChannelsCache[targetId] = liveMap;
                        }

                        if (ipc) {
                            const [cloudProgress, cloudFavorites]: any[] = await Promise.all([
                                this.panelSync.getAllProgress(userIdObj),
                                this.panelSync.getAllFavorites(userIdObj)
                            ]);
                            
                            if (cloudProgress) {
                                const processCloud = async (fbType: string, dbType: string) => {
                                    if (cloudProgress[fbType]) {
                                        for (const catId of Object.keys(cloudProgress[fbType])) {
                                            const items = fbType === 'Series' ? cloudProgress[fbType][catId] : { [catId]: cloudProgress[fbType][catId] };
                                            const cId = fbType === 'Series' ? catId : undefined;
                                            
                                            for (const itemId of Object.keys(items)) {
                                                const data = items[itemId];
                                                if (data && (data.timeline > 0 || data.timestamp || data.showInContinueWatchingList)) {
                                                    const targetLookupId = cId ? Number(cId) : Number(itemId);
                                                    
                                                    let realTitle = data.title && data.title !== 'null' ? data.title : undefined;
                                                    let realPoster = data.thumbnail && data.thumbnail !== 'null' ? data.thumbnail : undefined;

                                                    if (!realTitle || !realPoster) {
                                                        try {
                                                            const content = await ipc.invoke('DB_GET_CONTENT_BY_XTREAM_ID', {
                                                                xtreamId: targetLookupId,
                                                                playlistId: targetId,
                                                                contentType: dbType
                                                            });
                                                            const realContent = Array.isArray(content) ? content[0] : content;
                                                            if (realContent) {
                                                                realTitle = realTitle || realContent.title;
                                                                realPoster = realPoster || realContent.poster_url || realContent.backdrop_url;
                                                            }
                                                        } catch(e) {}
                                                    }

                                                    if (!realTitle || !realPoster) {
                                                        try {
                                                            const action = fbType === 'Series' ? 'get_series_info&series_id=' : 'get_vod_info&vod_id=';
                                                            const url = `${baseUrl}/player_api.php?username=${user}&password=${pass}&action=${action}${targetLookupId}`;
                                                            const resp = await fetch(url).then(r => r.json());
                                                            if (resp) {
                                                                if (fbType === 'Series' && resp.info) {
                                                                    realTitle = realTitle || resp.info.name;
                                                                    realPoster = realPoster || resp.info.cover || resp.info.backdrop_path?.[0];
                                                                } else if (resp.movie_data || resp.info) {
                                                                    realTitle = realTitle || resp.movie_data?.name || resp.info?.name || resp.info?.movie_name;
                                                                    realPoster = realPoster || resp.movie_data?.poster || resp.info?.movie_image || resp.info?.cover;
                                                                }
                                                            }
                                                        } catch(e) {}
                                                    }

                                                    await ipc.invoke('DB_SAVE_PLAYBACK_POSITION', {
                                                        playlistId: targetId,
                                                        data: {
                                                            contentXtreamId: Number(itemId),
                                                            contentType: dbType,
                                                            seriesXtreamId: cId ? Number(cId) : undefined,
                                                            positionSeconds: data.timeline || 0,
                                                            durationSeconds: data.duration || (data.timeline ? data.timeline * 1.25 : 0),
                                                            title: realTitle || 'Contenido',
                                                            poster: realPoster || ''
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
                                                try {
                                                    let realPoster = thumb && thumb !== 'null' ? thumb : undefined;
                                                    
                                                    if (!realPoster) {
                                                        if (type === 'LiveTv' && win.__liveChannelsCache?.[targetId]) {
                                                            const liveInfo = win.__liveChannelsCache[targetId].get(String(itemId));
                                                            if (liveInfo) realPoster = liveInfo.logo;
                                                        } else {
                                                            const cType = type === 'Series' ? 'series' : 'movie';
                                                            const content = await ipc.invoke('DB_GET_CONTENT_BY_XTREAM_ID', {
                                                                xtreamId: Number(itemId),
                                                                playlistId: targetId,
                                                                contentType: cType
                                                            });
                                                            const realContent = Array.isArray(content) ? content[0] : content;
                                                            if (realContent) {
                                                                realPoster = realContent.poster_url || realContent.backdrop_url;
                                                            } else {
                                                                const action = type === 'Series' ? 'get_series_info&series_id=' : 'get_vod_info&vod_id=';
                                                                const url = `${baseUrl}/player_api.php?username=${user}&password=${pass}&action=${action}${itemId}`;
                                                                const resp = await fetch(url).then(r => r.json());
                                                                if (resp) {
                                                                    if (type === 'Series' && resp.info) {
                                                                        realPoster = resp.info.cover || resp.info.backdrop_path?.[0];
                                                                    } else if (resp.movie_data || resp.info) {
                                                                        realPoster = resp.movie_data?.poster || resp.info?.movie_image || resp.info?.cover;
                                                                    }
                                                                }
                                                            }
                                                        }
                                                    }

                                                    await ipc.invoke('DB_ADD_FAVORITE', {
                                                        contentId: Number(itemId),
                                                        playlistId: targetId,
                                                        backdropUrl: realPoster || undefined
                                                    });
                                                } catch(e) {}
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    } catch(e) {}
                }

                setTimeout(async () => {
                    const navExitoso = await this.router.navigate(['/workspace']);
                    if (!navExitoso) {
                        this.isLoading = false;
                    }
                }, 800);

            } else {
                this.errorMessage = '';
                this.isLoading = false;
            }

        } catch (error: any) {
            if (error instanceof HttpErrorResponse) {
                this.errorMessage = `Error Status ${error.status}`;
            } else {
                this.errorMessage = `Error: ${error.message}`;
            }
            this.isLoading = false;
        }
    }
}