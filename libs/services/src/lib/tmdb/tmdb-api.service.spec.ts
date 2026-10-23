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

    it('asks the panel when the key is the panel one, and TMDB with a key typed by the user', async () => {
        localStorage.setItem('panel_tmdb_key', 'pk');
        try {
            await new TmdbApiService().getTvDetails(1, 'es-MX', 'pk');
            expect(calls[0].pathname.endsWith('/tmdb.php')).toBe(true);
            expect(calls[0].searchParams.get('path')).toBe('tv/1');
            expect(calls[0].searchParams.get('api_key')).toBeNull();
            calls.length = 0;
            await new TmdbApiService().getTvDetails(1, 'es-MX', 'mine');
            expect(calls[0].host).toBe('api.themoviedb.org');
        } finally {
            localStorage.removeItem('panel_tmdb_key');
        }
    });
});
