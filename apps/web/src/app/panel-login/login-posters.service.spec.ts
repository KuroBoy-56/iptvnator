import { loginPostersUrl, postersFromPages } from './login-posters.service';

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

    it('builds the poster URLs of every page without repeats', () => {
        const pages = [{ results: [{ poster_path: '/a.jpg' }, { poster_path: null }] }, { results: [{ poster_path: '/a.jpg' }, { poster_path: '/b.jpg' }] }];
        expect(postersFromPages(pages)).toEqual(['https://image.tmdb.org/t/p/w342/a.jpg', 'https://image.tmdb.org/t/p/w342/b.jpg']);
    });
});
