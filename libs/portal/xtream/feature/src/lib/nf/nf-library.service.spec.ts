import { TestBed } from '@angular/core/testing';
import {
    PanelProgressEntry,
    PanelSyncService,
    toFavoritesTree,
    toProgressTree,
} from '@iptvnator/services';
import { NfItem } from './nf-item';
import { NfLibraryService } from './nf-library.service';

function item(type: 'movie' | 'series', id: number): NfItem {
    return {
        id,
        type,
        title: `${type} ${id}`,
        poster: '',
        rating: '',
        categoryId: '1',
        added: 0,
    };
}

const entry = (
    type: 'movie' | 'episode',
    id: string,
    ts: number,
    seriesId = ''
): PanelProgressEntry => ({
    position: 50,
    duration: 100,
    type,
    id,
    seriesId,
    // same second for every row: only `ts` can tell them apart
    updatedAt: '2026-10-08 10:00:00',
    ts,
});

describe('NfLibraryService', () => {
    const panel = {
        getAllProgress: jest.fn(),
        getAllFavorites: jest.fn(),
    };

    beforeEach(() => {
        TestBed.configureTestingModule({
            providers: [{ provide: PanelSyncService, useValue: panel }],
        });
    });

    function load() {
        return TestBed.inject(NfLibraryService).load(
            { username: 'u', password: 'p', server: 'http://dns' },
            [item('movie', 1), item('movie', 2), item('movie', 3)],
            [item('series', 10), item('series', 20)]
        );
    }

    it('lists Continuar viendo newest first (panel ts), series by their last episode', async () => {
        panel.getAllProgress.mockResolvedValue(
            toProgressTree({
                // keys and ids in "wrong" order on purpose
                '1': entry('movie', '1', 1791453600.3),
                '2': entry('movie', '2', 1791453600.9),
                '3': entry('movie', '3', 1791453500),
                'Show A E1': entry('episode', '101', 1791453000, '10'),
                'Show A E2': entry('episode', '102', 1791453700, '10'),
                'Show B E1': entry('episode', '201', 1791453600.5, '20'),
            })
        );
        panel.getAllFavorites.mockResolvedValue(toFavoritesTree([]));

        const lib = await load();

        expect(lib.continueWatching.map((i) => `${i.type}:${i.id}`)).toEqual([
            'series:10',
            'movie:2',
            'series:20',
            'movie:1',
            'movie:3',
        ]);
        expect(lib.continueWatching[0].progress).toBe(50);
    });

    it('keeps every item (the Ver todo page shows the full list)', async () => {
        const progress: Record<string, PanelProgressEntry> = {};
        const movies: NfItem[] = [];
        for (let i = 1; i <= 25; i++) {
            progress[`M${i}`] = entry('movie', String(i), 1_700_000_000 + i);
            movies.push(item('movie', i));
        }
        panel.getAllProgress.mockResolvedValue(toProgressTree(progress));
        panel.getAllFavorites.mockResolvedValue(toFavoritesTree([]));

        const lib = await TestBed.inject(NfLibraryService).load(
            { username: 'u' },
            movies,
            []
        );

        expect(lib.continueWatching).toHaveLength(25);
        expect(lib.continueWatching[0].id).toBe(25);
    });

    it('lists Mi lista newest first and skips titles the provider no longer has', async () => {
        panel.getAllProgress.mockResolvedValue(toProgressTree({}));
        panel.getAllFavorites.mockResolvedValue(
            toFavoritesTree([
                { id: '3', type: 'movie', ts: 1_700_000_300 },
                { id: '999', type: 'movie', ts: 1_700_000_900 },
                { id: '20', type: 'series', ts: 1_700_000_500 },
                { id: '1', type: 'movie', addedAt: '2023-11-14T22:13:30Z' },
            ])
        );

        const lib = await load();

        expect(lib.myList.map((i) => `${i.type}:${i.id}`)).toEqual([
            'series:20',
            'movie:3',
            'movie:1',
        ]);
    });
});
