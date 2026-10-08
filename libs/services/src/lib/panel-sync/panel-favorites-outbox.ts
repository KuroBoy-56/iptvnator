import { favoriteBucket } from './panel-sync.mapper';
import { PanelFavorite, PanelFavoriteType } from './panel-sync.types';

const STORAGE_KEY = 'panel_fav_outbox';
/** A change stays authoritative locally this long, even after the panel accepted it. */
export const FAVORITE_GRACE_MS = 120_000;
/** Failed changes are retried for this long, then dropped. */
const MAX_AGE_MS = 7 * 24 * 3600 * 1000;

export interface FavoriteChange {
    op: 'add' | 'remove';
    user: string;
    type: PanelFavoriteType;
    id: string;
    item?: Omit<PanelFavorite, 'addedAt'>;
    at: number;
    /** true once the panel confirmed it. */
    sent?: boolean;
}

function key(c: Pick<FavoriteChange, 'user' | 'type' | 'id'>): string {
    return `${c.user}|${c.type}:${c.id}`;
}

/**
 * Favorite toggles waiting for (or recently confirmed by) the panel.
 * - Failed requests (no network, panel down, expired token) are retried later
 *   instead of being lost.
 * - While a change is fresh, the periodic cache rebuild and the favorite
 *   button trust it over a panel snapshot that may predate it.
 */
export class PanelFavoritesOutbox {
    private readonly changes = new Map<string, FavoriteChange>();

    constructor() {
        try {
            const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]') as FavoriteChange[];
            for (const c of Array.isArray(saved) ? saved : []) {
                if (c && c.user && c.type && c.id) this.changes.set(key(c), c);
            }
        } catch {
            // Corrupt or unavailable storage: start empty.
        }
    }

    record(change: Omit<FavoriteChange, 'at' | 'sent'>): FavoriteChange {
        const entry: FavoriteChange = { ...change, at: Date.now() };
        this.changes.set(key(entry), entry);
        this.persist();
        return entry;
    }

    markSent(change: FavoriteChange): void {
        const current = this.changes.get(key(change));
        if (current && current.at === change.at) {
            current.sent = true;
            this.persist();
        }
    }

    /** Changes the panel has not confirmed yet, oldest first. */
    pending(user: string): FavoriteChange[] {
        this.prune();
        return [...this.changes.values()]
            .filter((c) => c.user === user && !c.sent)
            .sort((a, b) => a.at - b.at);
    }

    /** Changes that must win over a panel snapshot (unsent, or sent within the grace window). */
    overrides(user: string): FavoriteChange[] {
        this.prune();
        const now = Date.now();
        return [...this.changes.values()].filter(
            (c) => c.user === user && (!c.sent || now - c.at < FAVORITE_GRACE_MS)
        );
    }

    private prune(): void {
        const now = Date.now();
        let changed = false;
        for (const [k, c] of this.changes) {
            const done = c.sent && now - c.at >= FAVORITE_GRACE_MS;
            if (done || now - c.at > MAX_AGE_MS) {
                this.changes.delete(k);
                changed = true;
            }
        }
        if (changed) this.persist();
    }

    private persist(): void {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify([...this.changes.values()]));
        } catch {
            // Storage full or unavailable: the outbox still works for this session.
        }
    }
}

/** Applies fresh local changes on top of the panel's favorites list. */
export function applyFavoriteOverrides(
    favorites: PanelFavorite[],
    overrides: FavoriteChange[]
): PanelFavorite[] {
    if (!overrides.length) return favorites;
    const keyOf = (type: unknown, id: unknown) => `${favoriteBucket(type) ?? type}:${String(id ?? '').trim()}`;
    const touched = new Set(overrides.map((c) => keyOf(c.type, c.id)));
    const out = favorites.filter((f) => f && !touched.has(keyOf(f.type, f.id)));
    for (const c of overrides) {
        if (c.op === 'add') {
            out.unshift({ ...(c.item ?? { id: c.id, type: c.type }), addedAt: new Date(c.at).toISOString(), ts: c.at / 1000 });
        }
    }
    return out;
}
