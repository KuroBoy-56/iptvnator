import { PanelWeekTopService, parseWeekTop, weekShuffle, weekTitleKey, weekTop10, weekTop10Home, WeekTopLists } from './panel-week-top';

type It = { title: string; year?: string; rating?: string };

const lists: WeekTopLists = {
    movies: [
        { t: 'Una película nueva', o: 'A New Movie', y: 2026 },
        { t: 'Duna: Parte dos', o: 'Dune: Part Two', y: 2024 },
    ],
    series: [{ t: 'La serie', o: 'The Show', y: 2025 }],
    all: [
        { series: false, t: 'Duna: Parte dos', o: 'Dune: Part Two', y: 2024 },
        { series: true, t: 'La serie', o: 'The Show', y: 2025 },
    ],
};

describe('Top 10 de la semana', () => {
    it('compara títulos sin prefijos, años, etiquetas ni acentos (como las demás apps)', () => {
        expect(weekTitleKey('LAT | Duna: Parte Dos (2024) [4K]')).toBe('duna parte dos');
        expect(weekTitleKey('ES - Película 4K HDR')).toBe('pelicula');
        expect(weekTitleKey('Dune: Part Two 2024')).toBe('dune part two');
    });

    it('cruza por título (español u original) y año ±1, y completa con lo mejor calificado', () => {
        const items: It[] = [
            { title: 'Dune: Part Two (2024)', rating: '8.5' },
            { title: 'A New Movie', year: '2019', rating: '9' },
            ...Array.from({ length: 30 }, (_, i) => ({ title: `Otra ${i}`, rating: String(i / 3) })),
        ];
        const top = weekTop10(lists, items, false);
        expect(top).toHaveLength(10);
        // «A New Movie» de 2019 no es la de 2026: no entra por la lista de la semana
        expect(top[0].title).toBe('Dune: Part Two (2024)');
        expect(new Set(top).size).toBe(10);
    });

    it('en Inicio alterna películas y series en el orden de la semana', () => {
        const movies: It[] = [{ title: 'Duna: Parte dos', year: '2024' }];
        const series: It[] = [{ title: 'The Show', year: '2025' }];
        expect(weekTop10Home(lists, movies, series).map((i) => i.title)).toEqual(['Duna: Parte dos', 'The Show']);
    });

    it('el relleno es fijo en la semana y cambia la siguiente', () => {
        const a = Array.from({ length: 20 }, (_, i) => i);
        expect(weekShuffle(a, 1, 202645)).toEqual(weekShuffle(a, 1, 202645));
        expect(weekShuffle(a, 1, 202646)).not.toEqual(weekShuffle(a, 1, 202645));
    });

    it('lee la respuesta del panel y la guarda; con una lista reciente no vuelve a preguntar', async () => {
        localStorage.clear();
        expect(parseWeekTop({ nada: 1 })).toBeNull();
        const service = new PanelWeekTopService();
        const fetchFn = jest.fn().mockResolvedValue({
            ok: true,
            json: async () => ({ movies: [{ k: 'm', t: 'Duna', o: 'Dune', y: 2024 }], series: [], all: [] }),
        });
        service.fetchFn = fetchFn as unknown as typeof fetch;
        const now = Date.now();
        await service.load(now);
        expect(service.lists().movies).toEqual([{ series: false, t: 'Duna', o: 'Dune', y: 2024 }]);
        expect(String(fetchFn.mock.calls[0][0])).toContain('top10.php');
        await service.load(now + 3600_000);
        expect(fetchFn).toHaveBeenCalledTimes(1);
    });
});
