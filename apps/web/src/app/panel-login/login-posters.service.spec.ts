import { LoginPostersService, loginPostersUrl, postersFromPages } from './login-posters.service';

describe('login posters (panel TMDB key)', () => {
    it('asks the panel tmdb.php with ?path= (hostings without PATH_INFO)', () => {
        expect(loginPostersUrl(2, 'es')).toMatch(/tmdb\.php\?path=movie\/now_playing&language=es-MX&page=2&lang=es$/);
    });

    it('asks for the posters in the app language', () => {
        expect(loginPostersUrl(1, 'pt')).toMatch(/language=pt-BR&page=1&lang=pt$/);
        expect(loginPostersUrl(1, 'fr')).toMatch(/language=fr-FR&page=1&lang=fr$/);
    });

    it('no poster wall when the panel has no TMDB key', () => {
        expect(postersFromPages([{ error: 'tmdb_key_not_set' }])).toEqual([]);
    });

    it('never shows posters kept from before when the panel fails or has no key', async () => {
        localStorage.setItem('login_posters_v2', JSON.stringify({ at: Date.now(), posters: ['https://old/a.jpg'] }));
        const service = new LoginPostersService();
        await expect(service.load(jest.fn().mockRejectedValue(new Error('offline')))).resolves.toEqual([]);
        expect(localStorage.getItem('login_posters_v2')).toBeNull();
        const noKey = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ error: 'tmdb_key_not_set' }) });
        await expect(service.load(noKey as unknown as typeof fetch)).resolves.toEqual([]);
    });

    it('builds the poster URLs of every page without repeats', () => {
        const pages = [{ results: [{ poster_path: '/a.jpg' }, { poster_path: null }] }, { results: [{ poster_path: '/a.jpg' }, { poster_path: '/b.jpg' }] }];
        expect(postersFromPages(pages)).toEqual(['https://image.tmdb.org/t/p/w342/a.jpg', 'https://image.tmdb.org/t/p/w342/b.jpg']);
    });
});
