import { Injectable } from '@angular/core';

function md5(string: string): string {
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
    function convertToWordArray(string: string) {
        let lWordCount;
        let lMessageLength = string.length;
        let lNumberOfWords_temp1 = lMessageLength + 8;
        let lNumberOfWords_temp2 = (lNumberOfWords_temp1 - (lNumberOfWords_temp1 % 64)) / 64;
        let lNumberOfWords = (lNumberOfWords_temp2 + 1) * 16;
        let lWordArray = Array(lNumberOfWords - 1);
        let lBytePosition = 0;
        let lByteCount = 0;
        while (lByteCount < lMessageLength) {
            lWordCount = (lByteCount - (lByteCount % 4)) / 4;
            lBytePosition = (lByteCount % 4) * 8;
            lWordArray[lWordCount] = (lWordArray[lWordCount] | (string.charCodeAt(lByteCount) << lBytePosition));
            lByteCount++;
        }
        lWordCount = (lByteCount - (lByteCount % 4)) / 4;
        lBytePosition = (lByteCount % 4) * 8;
        lWordArray[lWordCount] = lWordArray[lWordCount] | (0x80 << lBytePosition);
        lWordArray[lNumberOfWords - 2] = lMessageLength << 3;
        lWordArray[lNumberOfWords - 1] = lMessageLength >>> 29;
        return lWordArray;
    }
    function wordToHex(lValue: number) {
        let WordToHexValue = "", WordToHexValue_temp = "", lByte, lCount;
        for (lCount = 0; lCount <= 3; lCount++) {
            lByte = (lValue >>> (lCount * 8)) & 255;
            WordToHexValue_temp = "0" + lByte.toString(16);
            WordToHexValue = WordToHexValue + WordToHexValue_temp.substr(WordToHexValue_temp.length - 2, 2);
        }
        return WordToHexValue;
    }
    function utf8Encode(string: string) {
        string = string.replace(/\r\n/g, "\n");
        let utftext = "";
        for (let n = 0; n < string.length; n++) {
            let c = string.charCodeAt(n);
            if (c < 128) { utftext += String.fromCharCode(c); }
            else if ((c > 127) && (c < 2048)) {
                utftext += String.fromCharCode((c >> 6) | 192);
                utftext += String.fromCharCode((c & 63) | 128);
            } else {
                utftext += String.fromCharCode((c >> 12) | 224);
                utftext += String.fromCharCode(((c >> 6) & 63) | 128);
                utftext += String.fromCharCode((c & 63) | 128);
            }
        }
        return utftext;
    }
    let x = Array();
    let k, AA, BB, CC, DD, a, b, c, d;
    let S11=7, S12=12, S13=17, S14=22;
    let S21=5, S22=9 , S23=14, S24=20;
    let S31=4, S32=11, S33=16, S34=23;
    let S41=6, S42=10, S43=15, S44=21;
    string = utf8Encode(string);
    x = convertToWordArray(string);
    a = 0x67452301; b = 0xEFCDAB89; c = 0x98BADCFE; d = 0x10325476;
    for (k = 0; k < x.length; k += 16) {
        AA = a; BB = b; CC = c; DD = d;
        a = FF(a, b, c, d, x[k+0],  S11, 0xD76AA478); d = FF(d, a, b, c, x[k+1],  S12, 0xE8C7B756); c = FF(c, d, a, b, x[k+2],  S13, 0x242070DB); b = FF(b, c, d, a, x[k+3],  S14, 0xC1BDCEEE);
        a = FF(a, b, c, d, x[k+4],  S11, 0xF57C0FAF); d = FF(d, a, b, c, x[k+5],  S12, 0x4787C62A); c = FF(c, d, a, b, x[k+6],  S13, 0xA8304613); b = FF(b, c, d, a, x[k+7],  S14, 0xFD469501);
        a = FF(a, b, c, d, x[k+8],  S11, 0x698098D8); d = FF(d, a, b, c, x[k+9],  S12, 0x8B44F7AF); c = FF(c, d, a, b, x[k+10], S13, 0xFFFF5BB1); b = FF(b, c, d, a, x[k+11], S14, 0x895CD7BE);
        a = FF(a, b, c, d, x[k+12], S11, 0x6B901122); d = FF(d, a, b, c, x[k+13], S12, 0xFD987193); c = FF(c, d, a, b, x[k+14], S13, 0xA679438E); b = FF(b, c, d, a, x[k+15], S14, 0x49B40821);
        a = GG(a, b, c, d, x[k+1],  S21, 0xF61E2562); d = GG(d, a, b, c, x[k+6],  S22, 0xC040B340); c = GG(c, d, a, b, x[k+11], S23, 0x265E5A51); b = GG(b, c, d, a, x[k+0],  S24, 0xE9B6C7AA);
        a = GG(a, b, c, d, x[k+5],  S21, 0xD62F105D); d = GG(d, a, b, c, x[k+10], S22, 0x2441453);  c = GG(c, d, a, b, x[k+15], S23, 0xD8A1E681); b = GG(b, c, d, a, x[k+4],  S24, 0xE7D3FBC8);
        a = GG(a, b, c, d, x[k+9],  S21, 0x21E1CDE6); d = GG(d, a, b, c, x[k+14], S22, 0xC33707D6); c = GG(c, d, a, b, x[k+3],  S23, 0xF4D50D87); b = GG(b, c, d, a, x[k+8],  S24, 0x455A14ED);
        a = GG(a, b, c, d, x[k+13], S21, 0xA9E3E905); d = GG(d, a, b, c, x[k+2],  S22, 0xFCEFA3F8); c = GG(c, d, a, b, x[k+7],  S23, 0x676F02D9); b = GG(b, c, d, a, x[k+12], S24, 0x8D2A4C8A);
        a = HH(a, b, c, d, x[k+5],  S31, 0xFFFA3942); d = HH(d, a, b, c, x[k+8],  S32, 0x8771F681); c = HH(c, d, a, b, x[k+11], S33, 0x6D9D6122); b = HH(b, c, d, a, x[k+14], S34, 0xFDE5380C);
        a = HH(a, b, c, d, x[k+1],  S31, 0xA4BEEA44); d = HH(d, a, b, c, x[k+4],  S32, 0x4BDECFA9); c = HH(c, d, a, b, x[k+7],  S33, 0xF6BB4B60); b = HH(b, c, d, a, x[k+10], S34, 0xBEBFBC70);
        a = HH(a, b, c, d, x[k+13], S31, 0x289B7EC6); d = HH(d, a, b, c, x[k+0],  S32, 0xEAA127FA); c = HH(c, d, a, b, x[k+3],  S33, 0xD4EF3085); b = HH(b, c, d, a, x[k+6],  S34, 0x4881D05);
        a = HH(a, b, c, d, x[k+9],  S31, 0xD9D4D039); d = HH(d, a, b, c, x[k+12], S32, 0xE6DB99E5); c = HH(c, d, a, b, x[k+15], S33, 0x1FA27CF8); b = HH(b, c, d, a, x[k+2],  S34, 0xC4AC5665);
        a = II(a, b, c, d, x[k+0],  S41, 0xF4292244); d = II(d, a, b, c, x[k+7],  S42, 0x432AFF97); c = II(c, d, a, b, x[k+14], S43, 0xAB9423A7); b = II(b, c, d, a, x[k+5],  S44, 0xFC93A039);
        a = II(a, b, c, d, x[k+12], S41, 0x655B59C3); d = II(d, a, b, c, x[k+3],  S42, 0x8F0CCC92); c = II(c, d, a, b, x[k+10], S43, 0xFFEFF47D); b = II(b, c, d, a, x[k+1],  S44, 0x85845DD1);
        a = II(a, b, c, d, x[k+8],  S41, 0x6FA87E4F); d = II(d, a, b, c, x[k+15], S42, 0xFE2CE6E0); c = II(c, d, a, b, x[k+6],  S43, 0xA3014314); b = II(b, c, d, a, x[k+13], S44, 0x4E0811A1);
        a = II(a, b, c, d, x[k+4],  S41, 0xF7537E82); d = II(d, a, b, c, x[k+11], S42, 0xBD3AF235); c = II(c, d, a, b, x[k+2],  S43, 0x2AD7D2BB); b = II(b, c, d, a, x[k+9],  S44, 0xEB86D391);
        a = addUnsigned(a, AA); b = addUnsigned(b, BB); c = addUnsigned(c, CC); d = addUnsigned(d, DD);
    }
    let temp = wordToHex(a) + wordToHex(b) + wordToHex(c) + wordToHex(d);
    return temp.toLowerCase();
}

const seriesInfoCache = new Map<string, any>();

@Injectable({ providedIn: 'root' })
export class FirebaseSyncService {
    private dbUrl = 'https://kuro-database-default-rtdb.firebaseio.com';

    private isAuthorized(): boolean {
        return localStorage.getItem('DRM_LOCKED') === 'false';
    }

    private async getUserHash(userIdObj: any): Promise<string> {
        let usr = userIdObj?.username || localStorage.getItem('session_user') || 'default_user';
        let pwd = userIdObj?.password || localStorage.getItem('session_pass') || '';
        usr = usr.trim();
        pwd = pwd.trim();
        try {
            const hashUser = md5(usr);
            const hashPass = md5(pwd);
            const hashSrv = 'bad90e6f3a74f4aeab6ccee156c1726d';
            return `${hashUser}-${hashPass}-${hashSrv}`;
        } catch (e) {
            return 'default_user_hash';
        }
    }

    async saveProgress(userIdObj: any, pbInfo: any, currentTime: number, duration: number) {
        if (!this.isAuthorized() || !pbInfo || currentTime <= 5) return;
        
        try {
            const hash = await this.getUserHash(userIdObj);
            const timestamp = Math.floor(Date.now() / 1000);
            
            if (pbInfo.type === 'movie' && pbInfo.id) {
                const url = `${this.dbUrl}/${hash}/Recent/Movie/${pbInfo.id}.json`;
                const body = {
                    duration: Math.floor(duration),
                    thumbnail: pbInfo.poster && pbInfo.poster !== 'null' ? pbInfo.poster : (pbInfo.thumbnail || ''),
                    timeline: Math.floor(currentTime),
                    timestamp: timestamp
                };
                
                await fetch(url, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(body)
                });
            } 
            else if (pbInfo.type === 'series' && pbInfo.id) {
                const seriesId = pbInfo.categoryId || pbInfo.id;
                const episodeId = pbInfo.id;
                
                let epName = pbInfo.title && pbInfo.title !== 'null' && pbInfo.title.trim() !== '' ? pbInfo.title : '';
                let epThumb = pbInfo.poster && pbInfo.poster !== 'null' && pbInfo.poster.trim() !== '' ? pbInfo.poster : (pbInfo.thumbnail || '');
                let epSeason = pbInfo.seasonNumber || pbInfo.season || "1";

                if ((!epName || !epThumb) && userIdObj?.server) {
                    const cacheKey = `${userIdObj.server}_${seriesId}_${episodeId}`;
                    if (!seriesInfoCache.has(cacheKey)) {
                        try {
                            const baseUrl = userIdObj.server.trim().replace(/\/+$/, '');
                            const urlInfo = `${baseUrl}/player_api.php?username=${userIdObj.username}&password=${userIdObj.password}&action=get_series_info&series_id=${seriesId}`;
                            const resp = await fetch(urlInfo).then(r => r.json());
                            let foundName = '';
                            let foundThumb = '';
                            let foundSeason = '1';
                            if (resp && resp.episodes) {
                                for (const season of Object.values(resp.episodes)) {
                                    const ep = (season as any[]).find((e: any) => String(e.id) === String(episodeId));
                                    if (ep) {
                                        foundName = `${resp.info?.name || ''} - S${String(ep.season || 1).padStart(2, '0')}E${String(ep.episode_num || 1).padStart(2, '0')} - ${ep.title || ep.info?.name || ''}`.replace(/^ - | - $/g, '');
                                        foundThumb = resp.info?.cover || resp.info?.backdrop_path?.[0] || '';
                                        foundSeason = String(ep.season || 1);
                                        break;
                                    }
                                }
                            }
                            seriesInfoCache.set(cacheKey, { epName: foundName, epThumb: foundThumb, epSeason: foundSeason });
                        } catch(e) {
                            seriesInfoCache.set(cacheKey, { epName: '', epThumb: '', epSeason: '1' });
                        }
                    }
                    const cached = seriesInfoCache.get(cacheKey);
                    if (cached) {
                        if (!epName) epName = cached.epName;
                        if (!epThumb) epThumb = cached.epThumb;
                        if (cached.epSeason !== '1') epSeason = cached.epSeason;
                    }
                }

                if (!epName) epName = `Episodio ${episodeId}`;

                const url = `${this.dbUrl}/${hash}/Recent/Series/${seriesId}.json`;
                
                const body = {
                    showInContinueWatchingList: "true",
                    timestamp: timestamp,
                    [episodeId]: {
                        duration: Math.floor(duration),
                        episodeName: epName,
                        lastWatched: "true",
                        season: String(epSeason),
                        thumbnail: epThumb,
                        timeline: Math.floor(currentTime),
                        showInContinueWatchingList: "true",
                        timestamp: timestamp
                    }
                };

                await fetch(url, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(body)
                });
            }
        } catch (error) {}
    }

    async getProgress(userIdObj: any, pbInfo: any): Promise<number> {
        if (!this.isAuthorized() || !pbInfo) return 0;
        try {
            const hash = await this.getUserHash(userIdObj);
            let url = '';
            if (pbInfo.type === 'movie' && pbInfo.id) {
                url = `${this.dbUrl}/${hash}/Recent/Movie/${pbInfo.id}.json`;
            } else if (pbInfo.type === 'series' && pbInfo.id) {
                const seriesId = pbInfo.categoryId || pbInfo.id;
                url = `${this.dbUrl}/${hash}/Recent/Series/${seriesId}/${pbInfo.id}.json`;
            }
            if (url) {
                const response = await fetch(url);
                const result = await response.json();
                if (result && result.timeline) return result.timeline;
            }
        } catch (error) {}
        return 0;
    }

    async getAllProgress(userIdObj: any): Promise<any> {
        if (!this.isAuthorized()) return {};
        try {
            const hash = await this.getUserHash(userIdObj);
            const url = `${this.dbUrl}/${hash}/Recent.json`;
            const response = await fetch(url);
            const result = await response.json();
            return result || {};
        } catch (error) { return {}; }
    }

    async addFavorite(userIdObj: any, type: string, id: string | number, timestamp: number, meta: any = {}) {
        if (!this.isAuthorized()) return;
        try {
            const hash = await this.getUserHash(userIdObj);
            const url = `${this.dbUrl}/${hash}/Fav/${type}/${id}.json`;
            
            const body: any = timestamp;
            
            await fetch(url, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            });
        } catch (error) {}
    }

    async removeFavorite(userIdObj: any, type: string, id: string | number) {
        if (!this.isAuthorized()) return;
        try {
            const hash = await this.getUserHash(userIdObj);
            const url = `${this.dbUrl}/${hash}/Fav/${type}/${id}.json`;
            await fetch(url, { method: 'DELETE' });
        } catch (error) {}
    }

    async getAllFavorites(userIdObj: any): Promise<any> {
        if (!this.isAuthorized()) return {};
        try {
            const hash = await this.getUserHash(userIdObj);
            const url = `${this.dbUrl}/${hash}/Fav.json`;
            const response = await fetch(url);
            const result = await response.json();
            return result || {};
        } catch (error) { return {}; }
    }
}