/** A poster shown in the Netflix-style rows, grids and billboard. */
export interface NfItem {
    /** Provider id: stream_id for movies, series_id for series. */
    id: number;
    type: 'movie' | 'series';
    title: string;
    poster: string;
    rating: string;
    categoryId: string;
    /** Unix seconds; 0 when unknown. */
    added: number;
    /** Watched share 0–100 for "Continuar viendo". */
    progress?: number;
}

type RawContent = Record<string, unknown>;

function text(value: unknown): string {
    if (value == null) return '';
    const s = String(value).trim();
    return s === 'null' || s === 'undefined' ? '' : s;
}

function rating(value: unknown): string {
    const n = Number(value);
    return Number.isFinite(n) && n > 0 ? (n > 10 ? n / 10 : n).toFixed(1) : '';
}

function addedSeconds(value: unknown): number {
    const raw = text(value);
    if (!raw) return 0;
    if (/^\d+$/.test(raw)) {
        const n = Number(raw);
        return n > 1e12 ? Math.floor(n / 1000) : n;
    }
    const ms = Date.parse(raw);
    return Number.isFinite(ms) ? Math.floor(ms / 1000) : 0;
}

/** Store rows (Electron DB or provider API, already normalized) → NfItem. */
export function toNfItem(
    raw: RawContent,
    type: 'movie' | 'series'
): NfItem | null {
    const id = Number(
        raw['xtream_id'] ??
            (type === 'series' ? raw['series_id'] : raw['stream_id']) ??
            raw['id']
    );
    if (!Number.isFinite(id) || id <= 0) return null;
    return {
        id,
        type,
        title: text(raw['title']) || text(raw['name']) || text(raw['o_name']),
        poster:
            text(raw['poster_url']) ||
            text(raw['stream_icon']) ||
            text(raw['cover']),
        rating: rating(raw['rating'] ?? raw['rating_imdb']),
        categoryId: text(raw['category_id']),
        added: addedSeconds(raw['added'] ?? raw['last_modified']),
    };
}

export function toNfItems(
    list: readonly unknown[],
    type: 'movie' | 'series'
): NfItem[] {
    const out: NfItem[] = [];
    for (const raw of list) {
        const item =
            raw && typeof raw === 'object'
                ? toNfItem(raw as RawContent, type)
                : null;
        if (item) out.push(item);
    }
    return out;
}

/** Route to the detail page of an item (the same page the grids open). */
export function nfLink(
    playlistId: string,
    item: Pick<NfItem, 'id' | 'type' | 'categoryId'>
): string[] {
    return [
        '/workspace',
        'xtreams',
        playlistId,
        item.type === 'series' ? 'series' : 'vod',
        item.categoryId || '0',
        String(item.id),
    ];
}

export function newestFirst(items: NfItem[]): NfItem[] {
    return [...items].sort((a, b) => b.added - a.added);
}

/** Highest rated first (ties: newest). Items without rating go last. */
export function topRated(items: NfItem[]): NfItem[] {
    return [...items].sort(
        (a, b) =>
            Number(b.rating || 0) - Number(a.rating || 0) || b.added - a.added
    );
}

/** Deterministic shuffle per day, so "para ti" rows stay stable while browsing. */
export function dailyShuffle(items: NfItem[], salt = ''): NfItem[] {
    const day = new Date().toISOString().slice(0, 10) + salt;
    let seed = 0;
    for (let i = 0; i < day.length; i++)
        seed = (seed * 31 + day.charCodeAt(i)) >>> 0;
    const out = [...items];
    for (let i = out.length - 1; i > 0; i--) {
        seed = (seed * 1103515245 + 12345) >>> 0;
        const j = seed % (i + 1);
        [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
}
