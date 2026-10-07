import {
    NF_GENRES,
    NF_PLATFORMS,
    nfAvailable,
    nfFindTag,
    nfTagItems,
} from './nf-filters';
import { NfItem, nfLink, newestFirst, toNfItem, topRated } from './nf-item';

const item = (
    id: number,
    categoryId: string,
    extra: Partial<NfItem> = {}
): NfItem => ({
    id,
    type: 'movie',
    title: `T${id}`,
    poster: '',
    rating: '',
    categoryId,
    added: id,
    ...extra,
});

describe('Netflix catalog helpers', () => {
    const categories = [
        { id: '1', name: 'NETFLIX Estrenos' },
        { id: '2', name: 'Acción y Aventura' },
        { id: '3', name: 'Infantiles' },
    ];

    it('finds platforms and genres by category name, accents ignored', () => {
        expect(nfAvailable(NF_PLATFORMS, categories).map((t) => t.key)).toEqual(
            ['netflix']
        );
        expect(nfAvailable(NF_GENRES, categories).map((t) => t.key)).toEqual(
            expect.arrayContaining(['accion', 'aventura', 'infantil'])
        );
        const netflix = nfFindTag('netflix');
        expect(
            netflix &&
                nfTagItems(
                    [item(1, '1'), item(2, '2')],
                    categories,
                    netflix
                ).map((i) => i.id)
        ).toEqual([1]);
    });

    it('does not match "max" inside other words', () => {
        const max = nfFindTag('max');
        if (!max) throw new Error('missing tag');
        expect(
            nfAvailable([max], [{ id: '9', name: 'Maximum Action' }])
        ).toEqual([]);
        expect(nfAvailable([max], [{ id: '9', name: 'Series MAX' }])).toEqual([
            max,
        ]);
    });

    it('normalizes store rows and builds detail links', () => {
        const row = toNfItem(
            {
                xtream_id: 5,
                title: 'Matrix',
                poster_url: 'p.jpg',
                rating: '78',
                category_id: 7,
                added: '1700000000',
            },
            'series'
        );
        expect(row).toEqual({
            id: 5,
            type: 'series',
            title: 'Matrix',
            poster: 'p.jpg',
            rating: '7.8',
            categoryId: '7',
            added: 1700000000,
        });
        if (!row) throw new Error('no row');
        expect(nfLink('pl', row)).toEqual([
            '/workspace',
            'xtreams',
            'pl',
            'series',
            '7',
            '5',
        ]);
        expect(toNfItem({ title: 'no id' }, 'movie')).toBeNull();
    });

    it('sorts by date and rating', () => {
        const list = [
            item(1, 'a', { rating: '9.0' }),
            item(3, 'a'),
            item(2, 'a', { rating: '7.0' }),
        ];
        expect(newestFirst(list).map((i) => i.id)).toEqual([3, 2, 1]);
        expect(topRated(list).map((i) => i.id)).toEqual([1, 2, 3]);
    });
});
