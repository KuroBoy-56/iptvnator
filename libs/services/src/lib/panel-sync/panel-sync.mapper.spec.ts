import {
    bucketToFavoriteType,
    findPosition,
    findProgressKey,
    isWatched,
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
});
