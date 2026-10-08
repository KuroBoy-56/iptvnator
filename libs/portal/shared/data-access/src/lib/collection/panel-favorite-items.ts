import type { SyncFavoritesTree } from '@iptvnator/services';
import {
    buildXtreamCollectionUid,
    UnifiedCollectionItem,
} from '@iptvnator/portal/shared/util';
import type { XtreamContentItem } from '@iptvnator/portal/xtream/data-access';

type PanelContentType = 'movie' | 'series' | 'live';

const BUCKETS: [keyof SyncFavoritesTree, PanelContentType][] = [
    ['Movie', 'movie'],
    ['Series', 'series'],
    ['LiveTv', 'live'],
];

const PLACEHOLDER_TITLE = /^(|null|undefined|favorito|contenido|(pel[ií]cula|serie|canal) \d+)$/i;

/** Looks an item up in the line's local catalog (DB on Electron, memory on PWA). */
export type XtreamContentResolver = (
    xtreamId: number,
    type: PanelContentType
) => Promise<XtreamContentItem | null>;

function text(value: unknown): string {
    const s = value == null ? '' : String(value).trim();
    return s === 'null' || s === 'undefined' ? '' : s;
}

function fallbackTitle(type: PanelContentType, id: number): string {
    if (type === 'live') return `Canal ${id}`;
    return type === 'movie' ? `Película ${id}` : `Serie ${id}`;
}

/**
 * "Mi lista" from the panel → collection items.
 *
 * The panel only knows the provider id (stream_id / series_id). Each favorite
 * is matched with the line's catalog so the item carries the local content row
 * id (used to open, play and remove it), the real title, cover and category.
 * Before this, contentId was set to the provider id and titles/covers came
 * only from the panel, so saved favorites showed as "Película 123" without
 * cover and could not be opened or removed. `resolved` is false for items
 * the catalog does not have (they keep the panel's data).
 */
export async function panelFavoritesToItems(
    tree: SyncFavoritesTree | null | undefined,
    playlist: { id: string; name: string },
    resolve: XtreamContentResolver
): Promise<{ item: UnifiedCollectionItem; resolved: boolean }[]> {
    const out: { item: UnifiedCollectionItem; resolved: boolean; at: number }[] = [];
    for (const [bucket, type] of BUCKETS) {
        for (const [rawId, leaf] of Object.entries(tree?.[bucket] ?? {})) {
            const xtreamId = Number(rawId);
            if (!Number.isFinite(xtreamId) || xtreamId <= 0) continue;
            let content: XtreamContentItem | null = null;
            try {
                content = await resolve(xtreamId, type);
            } catch {
                content = null;
            }
            const panelTitle = PLACEHOLDER_TITLE.test(text(leaf?.title)) ? '' : text(leaf?.title);
            const image = text(content?.poster_url) || text(content?.stream_icon) || text(leaf?.thumbnail);
            const seconds = Number(leaf?.timestamp) || 0;
            out.push({
                resolved: !!content,
                at: seconds,
                item: {
                    uid: buildXtreamCollectionUid(playlist.id, type, xtreamId),
                    name: text(content?.title) || text(content?.name) || panelTitle || fallbackTitle(type, xtreamId),
                    contentType: type,
                    sourceType: 'xtream',
                    playlistId: playlist.id,
                    playlistName: playlist.name || 'Xtream',
                    logo: type === 'live' ? image || null : null,
                    posterUrl: type !== 'live' ? image || null : null,
                    xtreamId,
                    categoryId: content?.category_id ?? (text(leaf?.categoryId) || '0'),
                    tvgId: type === 'live' ? String(xtreamId) : undefined,
                    rating: content?.rating || undefined,
                    // local row id when the catalog has it (Electron needs it to open/remove)
                    contentId: content?.id ?? xtreamId,
                    addedAt: new Date(seconds > 0 ? seconds * 1000 : 0).toISOString(),
                    position: 0,
                },
            });
        }
    }
    // newest first, like the web player and Android
    return out.sort((a, b) => b.at - a.at).map(({ item, resolved }) => ({ item, resolved }));
}
