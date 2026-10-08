import type { XtreamContentItem } from '@iptvnator/portal/xtream/data-access';
import { panelFavoritesToItems } from './panel-favorite-items';

describe('panelFavoritesToItems', () => {
    const tree = {
        Movie: {
            '501': { title: '', thumbnail: '', categoryId: '0', timestamp: 100 },
            '777': { title: 'Gone Movie', thumbnail: 'https://panel/p.jpg', categoryId: '3', timestamp: 300 },
        },
        Series: {
            '42': { title: 'Serie 42', thumbnail: '', categoryId: '0', timestamp: 200 },
        },
        LiveTv: {},
    };

    const catalog: Record<string, Partial<XtreamContentItem>> = {
        'movie:501': { id: 9001, title: 'Real Movie', poster_url: 'https://prov/m.jpg', category_id: 12, xtream_id: 501 },
        'series:42': { id: 9002, title: 'Real Series', poster_url: 'https://prov/s.jpg', category_id: 7, xtream_id: 42 },
    };

    it('uses the local catalog row (id, title, cover) and keeps panel data for unknown items', async () => {
        const resolve = jest.fn(async (id: number, type: string) =>
            (catalog[`${type}:${id}`] as XtreamContentItem) ?? null
        );
        const entries = await panelFavoritesToItems(tree, { id: 'pl-1', name: 'LatMpx TV+' }, resolve);

        expect(resolve).toHaveBeenCalledWith(501, 'movie');
        expect(resolve).toHaveBeenCalledWith(42, 'series');
        // newest first
        expect(entries.map((e) => e.item.xtreamId)).toEqual([777, 42, 501]);

        const movie = entries.find((e) => e.item.xtreamId === 501);
        expect(movie?.resolved).toBe(true);
        expect(movie?.item).toEqual(
            expect.objectContaining({
                contentId: 9001,
                name: 'Real Movie',
                posterUrl: 'https://prov/m.jpg',
                categoryId: 12,
                contentType: 'movie',
                playlistId: 'pl-1',
            })
        );
        expect(entries.find((e) => e.item.xtreamId === 42)?.item.name).toBe('Real Series');

        const gone = entries.find((e) => e.item.xtreamId === 777);
        expect(gone?.resolved).toBe(false);
        expect(gone?.item).toEqual(
            expect.objectContaining({ name: 'Gone Movie', posterUrl: 'https://panel/p.jpg', contentId: 777, categoryId: '3' })
        );
    });

    it('survives a failing catalog lookup', async () => {
        const entries = await panelFavoritesToItems(tree, { id: 'pl-1', name: '' }, () =>
            Promise.reject(new Error('db down'))
        );
        expect(entries).toHaveLength(3);
        expect(entries.find((e) => e.item.xtreamId === 42)?.item.name).toBe('Serie 42');
    });
});
