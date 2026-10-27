import { panelEndpoint } from '@iptvnator/shared/interfaces';
import { panelImgOn } from './panel-img-flag';
import { tokenKey } from './panel-progress.client';

/**
 * Posters and backdrops through the panel image cache (same rule as Roku, Vega and Android): one copy of each image
 * on the panel. Poster order: the panel's public copy (api/imgc/<sha1>.jpg, served by the web server without PHP),
 * then api/img.php (resizes it the first time; with the title it finds the TMDB poster when the IPTV server has
 * none) and last the original address. TMDB backdrops in Full HD made by the panel (img.php w=1920). When the owner
 * turns the cache off ("img": false from progress.php ?v=2) everything goes straight to the IPTV server and TMDB.
 */
const TOKEN_PREFIX = 'panel_sync_token2:';

function panelToken(): string {
    try {
        // the session line (sessionCredentials() without the password: the token key is user + server + distributor)
        const key = tokenKey({ username: localStorage.getItem('session_user') || '', server: localStorage.getItem('session_server') || '' });
        return key ? localStorage.getItem(TOKEN_PREFIX + key) ?? '' : '';
    } catch {
        return '';
    }
}

/** UTF-8 bytes as base64url without "=" (what api/img.php decodes). */
export function b64u(s: string): string {
    const bytes = new TextEncoder().encode(s);
    let bin = '';
    for (const b of bytes) bin += String.fromCharCode(b);
    return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** SHA-1 hex of the UTF-8 text (name of the panel's public copy). */
export function sha1Hex(s: string): string {
    const msg = new TextEncoder().encode(s);
    const len = msg.length;
    const words = new Uint32Array((((len + 8) >> 6) + 1) * 16);
    for (let i = 0; i < len; i++) words[i >> 2] |= msg[i] << (24 - (i % 4) * 8);
    words[len >> 2] |= 0x80 << (24 - (len % 4) * 8);
    words[words.length - 1] = len * 8;
    let [h0, h1, h2, h3, h4] = [0x67452301, 0xefcdab89, 0x98badcfe, 0x10325476, 0xc3d2e1f0];
    const w = new Uint32Array(80);
    for (let off = 0; off < words.length; off += 16) {
        for (let t = 0; t < 16; t++) w[t] = words[off + t];
        for (let t = 16; t < 80; t++) {
            const x = w[t - 3] ^ w[t - 8] ^ w[t - 14] ^ w[t - 16];
            w[t] = (x << 1) | (x >>> 31);
        }
        let [a, b, c, d, e] = [h0, h1, h2, h3, h4];
        for (let t = 0; t < 80; t++) {
            const f = t < 20 ? (b & c) | (~b & d) : t < 40 ? b ^ c ^ d : t < 60 ? (b & c) | (b & d) | (c & d) : b ^ c ^ d;
            const k = t < 20 ? 0x5a827999 : t < 40 ? 0x6ed9eba1 : t < 60 ? 0x8f1bbcdc : 0xca62c1d6;
            const tmp = (((a << 5) | (a >>> 27)) + f + e + k + w[t]) >>> 0;
            e = d;
            d = c;
            c = (b << 30) | (b >>> 2);
            b = a;
            a = tmp;
        }
        h0 = (h0 + a) >>> 0;
        h1 = (h1 + b) >>> 0;
        h2 = (h2 + c) >>> 0;
        h3 = (h3 + d) >>> 0;
        h4 = (h4 + e) >>> 0;
    }
    return [h0, h1, h2, h3, h4].map((h) => (h >>> 0).toString(16).padStart(8, '0')).join('');
}

const isTmdb = (u: string) => u.includes('image.tmdb.org/');
const isHttp = (u: string) => /^https?:\/\//i.test(u);
const year4 = (y: string) => (/^(19|20)\d\d$/.test(y) ? y : '');

/**
 * Name of the panel copy (same as img_key / img_idkey of api/img.php): with the TMDB id "500|tmdbid:<kind>:<id>";
 * otherwise the image without http/https and with the host in lower case, and TMDB images by their file.
 */
function canonKey(poster: string, kind: string, tm: string): string {
    if (tm) return `500|tmdbid:${kind}:${tm}`;
    const m = /image\.tmdb\.org\/t\/p\/[^/]+\/([A-Za-z0-9_-]+\.(?:jpe?g|png|webp))/i.exec(poster);
    if (m) return '500|tmdb:' + m[1];
    const u = poster.replace(/^https?:\/\//i, '');
    const slash = u.indexOf('/');
    return '500|' + (slash < 0 ? u.toLowerCase() : u.slice(0, slash).toLowerCase() + u.slice(slash));
}

/** "https://panel/api/" or '' (cache off, no panel token). */
function base(): string {
    return panelImgOn() && panelToken() ? panelEndpoint('') : '';
}

/** Poster addresses in order (the card moves to the next one when one does not load). */
export function panelPosterSources(type: string, poster: string, title: string, year = '', tmdbId = ''): string[] {
    const out: string[] = [];
    const b = base();
    const media = type === 'movie' || type === 'vod' || type === 'series';
    const tm = /^\d+$/.test(tmdbId.trim()) ? tmdbId.trim() : '';
    const name = title.trim();
    // channel logos and TMDB posters: straight (already light)
    if (b && media && !isTmdb(poster) && (isHttp(poster) || name)) {
        const y = year4(year);
        const kind = type === 'series' ? 'series' : 'vod';
        const src = isHttp(poster) ? poster : '';
        const key = src || tm ? canonKey(src, kind, tm) : `500|n|${kind}|${name}|${y}`;
        // ?v=2: the panel emptied its cache once (old TMDB posters could be of another film)
        out.push(`${b}imgc/${sha1Hex(key)}.jpg?v=2`);
        let u = `${b}img.php?w=500&v=2&token=${encodeURIComponent(panelToken())}`;
        if (src) u += '&u=' + b64u(src);
        if (name || tm) u += '&k=' + kind;
        if (name) u += '&n=' + b64u(name) + (y ? '&y=' + y : '');
        if (tm) u += '&t=' + tm;
        out.push(u);
    }
    if (poster && !out.includes(poster)) out.push(poster);
    return out;
}

/** Backdrop: the TMDB one in Full HD made by the panel and, if it fails, the usual one. */
export function panelBackdropSources(url: string): string[] {
    if (!url) return [];
    const b = base();
    if (!b || !isTmdb(url)) return [url];
    const orig = url.replace(/(image\.tmdb\.org\/t\/p\/)[^/]+\//, '$1original/');
    return [`${b}img.php?w=1920&token=${encodeURIComponent(panelToken())}&u=${b64u(orig)}`, url];
}
