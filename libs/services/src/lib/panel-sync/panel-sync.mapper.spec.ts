import {
    bucketToFavoriteType,
    findPosition,
    findProgressKey,
    isWatched,
    panelNewestFirst,
    toFavoritesTree,
    toProgressTree,
} from './panel-sync.mapper';
import { PanelProgressEntry } from './panel-sync.types';

const progress: Record<string, PanelProgressEntry> = {
    'Movie A': { position: 120, duration: 6000, type: 'movie', id: '10', poster: 'https://p/a.jpg', updatedAt: '2026-01-01T00:00:00Z' },
    'Show B': { position: 300, duration: 1500, type: 'episode', id: '501', seriesId: '50', updatedAt: '2026-01-02T00:00:00Z' },
    Empty: { position: 0, duration: 0, type: 'movie', id: '11' },
};

describe('panel sync mapper', () => {
    it('maps progress into Movie and Series buckets', () => {
        const tree = toProgressTree(progress);
        expect(tree.Movie['10']).toMatchObject({ timeline: 120, duration: 6000, title: 'Movie A', thumbnail: 'https://p/a.jpg' });
        expect(tree.Movie['10'].timestamp).toBe(Date.parse('2026-01-01T00:00:00Z') / 1000);
        expect(tree.Series['50']['501']).toMatchObject({ timeline: 300, episodeName: 'Show B' });
        expect(tree.Movie['11']).toBeUndefined();
    });

    it('maps favorites into Movie/Series/LiveTv buckets', () => {
        const tree = toFavoritesTree([
            { id: '1', type: 'movie', title: 'M', poster: 'https://p/m.jpg' },
            { id: '2', type: 'series', title: 'S' },
            { id: '3', type: 'live', title: 'L', categoryId: '7' },
        ]);
        expect(tree.Movie['1'].thumbnail).toBe('https://p/m.jpg');
        expect(tree.Series['2'].title).toBe('S');
        expect(tree.LiveTv['3'].categoryId).toBe('7');
    });

    it('reads favorites whatever type spelling and timestamp format the panel returns', () => {
        const tree = toFavoritesTree([
            { id: 7 as unknown as string, type: 'vod' as never, title: 'Old movie', ts: 1_700_000_000 },
            { id: '8', type: 'Series' as never, addedAt: '2026-10-08 00:39:41' },
            { id: '9', type: 'live', ts: '1700000000000' },
            { id: '', type: 'movie' },
            { id: '10', type: 'unknown' as never },
        ]);
        expect(tree.Movie['7']).toEqual(expect.objectContaining({ title: 'Old movie', timestamp: 1_700_000_000 }));
        expect(tree.Series['8'].timestamp).toBe(Math.floor(Date.parse('2026-10-08T00:39:41') / 1000));
        expect(tree.LiveTv['9'].timestamp).toBe(1_700_000_000);
        expect(Object.keys(tree.Movie)).toEqual(['7']);
    });

    it('finds keys and positions by id', () => {
        expect(findProgressKey(progress, 'movie', '10')).toBe('Movie A');
        expect(findProgressKey(progress, 'series', '50')).toBe('Show B');
        expect(findPosition(progress, 'series', '501')).toBe(300);
        expect(findPosition(progress, 'movie', '999')).toBe(0);
    });

    it('converts bucket names and detects watched items', () => {
        expect(bucketToFavoriteType('Movie')).toBe('movie');
        expect(bucketToFavoriteType('Series')).toBe('series');
        expect(bucketToFavoriteType('LiveTv')).toBe('live');
        expect(isWatched(95, 100)).toBe(true);
        expect(isWatched(94, 100)).toBe(false);
        expect(isWatched(10, 0)).toBe(false);
    });

    it('orders progress newest first by the panel ts, not by id or title', () => {
        // ids and numeric titles make JS iterate in id order; updatedAt ties within a second
        const tree = toProgressTree({
            '300': { position: 10, duration: 100, type: 'movie', id: '5', updatedAt: '2026-10-08 10:00:00', ts: 1791453600.25 },
            '1917': { position: 10, duration: 100, type: 'movie', id: '9', updatedAt: '2026-10-08 10:00:00', ts: 1791453600.75 },
            Dune: { position: 10, duration: 100, type: 'movie', id: '1', updatedAt: '2026-10-08 09:00:00', ts: '1791450000123456' },
            Show: { position: 10, duration: 100, type: 'episode', id: '77', seriesId: '7', ts: 1791453700.5 },
        });
        expect(tree.Movie['9'].timestamp).toBeCloseTo(1791453600.75, 3);
        expect(tree.Movie['1'].timestamp).toBeCloseTo(1791450000.123456, 3);
        const order = [
            ...Object.entries(tree.Movie).map(([id, leaf]) => ({ id, ...leaf })),
            { id: 's7', ...tree.Series['7']['77'] },
        ]
            .sort(panelNewestFirst)
            .map((l) => l.id);
        expect(order).toEqual(['s7', '9', '5', '1']);
    });

    it('falls back to updatedAt and then to the panel order', () => {
        const tree = toProgressTree({
            'Movie New': { position: 10, duration: 100, type: 'movie', id: '2', updatedAt: '2026-01-02T00:00:00Z' },
            'Movie Undated A': { position: 10, duration: 100, type: 'movie', id: '1' },
            'Movie Undated B': { position: 10, duration: 100, type: 'movie', id: '3' },
        });
        expect(tree.Movie['2'].timestamp).toBe(Date.parse('2026-01-02T00:00:00Z') / 1000);
        const order = Object.entries(tree.Movie)
            .map(([id, leaf]) => ({ id, ...leaf }))
            .sort(panelNewestFirst)
            .map((l) => l.id);
        // undated rows keep the panel's (newest-first) order
        expect(order).toEqual(['2', '1', '3']);
    });

    it('orders favorites by ts before addedAt', () => {
        const tree = toFavoritesTree([
            { id: '1', type: 'movie', addedAt: '2026-10-08T12:00:00Z', ts: 1_700_000_100.5 },
            { id: '2', type: 'movie', addedAt: '2026-10-08T12:00:00Z', ts: 1_700_000_200.5 },
            { id: '3', type: 'series', addedAt: '2026-10-08T12:00:00Z' },
        ]);
        expect(tree.Movie['2'].timestamp).toBe(1_700_000_200.5);
        expect(tree.Movie['1'].rank).toBe(0);
        expect(tree.Series['3'].rank).toBe(2);
        const order = [...Object.entries(tree.Movie), ...Object.entries(tree.Series)]
            .map(([id, leaf]) => ({ id, ...leaf }))
            .sort(panelNewestFirst)
            .map((l) => l.id);
        expect(order).toEqual(['3', '2', '1']);
    });
});
