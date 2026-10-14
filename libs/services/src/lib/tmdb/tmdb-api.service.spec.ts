import { TmdbApiService } from './tmdb-api.service';

describe('TmdbApiService match language', () => {
    const calls: URL[] = [];
    const reply = (url: URL) =>
        url.pathname.endsWith('/recommendations')
            ? { results: [{ id: 2, title: 'El club de la pelea' }] }
            : url.pathname.endsWith('/combined_credits')
              ? { cast: [{ id: 3, title: 'Siete pecados capitales' }] }
              : {
                    id: 1,
                    recommendations: { results: [{ id: 2, title: 'Fight Club' }] },
                    combined_credits: { cast: [{ id: 3, title: 'Se7en' }] },
                };

    beforeEach(() => {
        calls.length = 0;
        global.fetch = jest.fn(async (u: string) => {
            const url = new URL(u);
            calls.push(url);
            return { ok: true, json: async () => reply(url) } as Response;
        }) as typeof fetch;
    });

    it('keeps "similar" titles in es-MX when details come in another language', async () => {
        const d = await new TmdbApiService().getMovieDetails(1, 'en-US', 'k');
        expect(d.recommendations?.results?.[0].title).toBe('El club de la pelea');
        expect(calls.map((c) => c.searchParams.get('language'))).toEqual(['en-US', 'es-MX']);
    });

    it('keeps the actor filmography in es-MX', async () => {
        const p = await new TmdbApiService().getPersonDetails(9, 'fr-FR', 'k');
        expect(p.combined_credits?.cast?.[0].title).toBe('Siete pecados capitales');
    });

    it('makes a single call in es-MX', async () => {
        await new TmdbApiService().getTvDetails(1, 'es-MX', 'k');
        expect(calls).toHaveLength(1);
    });
});
