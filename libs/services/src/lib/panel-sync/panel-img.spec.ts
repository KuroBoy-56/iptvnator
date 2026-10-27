import { panelEndpoint } from '@iptvnator/shared/interfaces';
import { b64u, panelBackdropSources, panelPosterSources, sha1Hex } from './panel-img';
import { rememberPanelImg } from './panel-img-flag';
import { tokenKey } from './panel-progress.client';

describe('panel image cache (same names as api/img.php, Roku, Vega and Android)', () => {
    const base = panelEndpoint('');
    const login = () => {
        localStorage.setItem('session_user', 'u1');
        localStorage.setItem('session_server', 'http://srv.example.com:8080');
        localStorage.setItem('panel_sync_token2:' + tokenKey({ username: 'u1', server: 'http://srv.example.com:8080' }), 'tok+1');
    };

    beforeEach(() => localStorage.clear());

    it('hashes and encodes like the panel', () => {
        expect(sha1Hex('abc')).toBe('a9993e364706816aba3e25717850c26c9cd0d89d');
        expect(sha1Hex('500|tmdbid:vod:603')).toBe('db8d2b095ba8b629a3a1e88835d5e303c328d072');
        expect(b64u('http://Srv.Example.com:8080/images/a b/ñ.jpg')).toBe('aHR0cDovL1Nydi5FeGFtcGxlLmNvbTo4MDgwL2ltYWdlcy9hIGIvw7EuanBn');
    });

    it('goes panel copy → img.php → original, with the host in lower case', () => {
        login();
        const poster = 'http://Srv.Example.com:8080/images/a b/ñ.jpg';
        const out = panelPosterSources('movie', poster, ' Matrix ', '1999');
        expect(out[0]).toBe(base + 'imgc/4842a7734a431c38c2f10492a3652cd5b3a90890.jpg?v=2');
        expect(out[1]).toBe(base + 'img.php?w=500&v=2&token=tok%2B1&u=' + b64u(poster) + '&k=vod&n=' + b64u('Matrix') + '&y=1999');
        expect(out[2]).toBe(poster);
    });

    it('uses the TMDB id, or the title when the server has no poster', () => {
        login();
        expect(panelPosterSources('movie', 'http://x/a.jpg', 'Matrix', '', '603')[0]).toBe(base + 'imgc/db8d2b095ba8b629a3a1e88835d5e303c328d072.jpg?v=2');
        const byName = panelPosterSources('series', '', 'La Casa de Papel', '2017');
        expect(byName).toHaveLength(2);
        expect(byName[0]).toBe(base + 'imgc/fd4ff3b313dcc83e2198d20ad2e40b00170a1e68.jpg?v=2');
    });

    it('goes straight without a panel token, with the cache off, for channels and TMDB posters', () => {
        expect(panelPosterSources('movie', 'http://x/a.jpg', 'A')).toEqual(['http://x/a.jpg']);
        login();
        expect(panelPosterSources('live', 'http://x/logo.png', 'Canal')).toEqual(['http://x/logo.png']);
        expect(panelPosterSources('movie', 'https://image.tmdb.org/t/p/w500/abc.jpg', 'A')).toEqual(['https://image.tmdb.org/t/p/w500/abc.jpg']);
        rememberPanelImg({ img: false });
        expect(panelPosterSources('movie', 'http://x/a.jpg', 'A')).toEqual(['http://x/a.jpg']);
        rememberPanelImg({ img: true });
        expect(panelPosterSources('movie', 'http://x/a.jpg', 'A')).toHaveLength(3);
    });

    it('asks the panel for TMDB backdrops in Full HD', () => {
        login();
        const url = 'https://image.tmdb.org/t/p/w1280/back.jpg';
        expect(panelBackdropSources(url)).toEqual([
            base + 'img.php?w=1920&token=tok%2B1&u=' + b64u('https://image.tmdb.org/t/p/original/back.jpg'),
            url,
        ]);
        expect(panelBackdropSources('http://x/b.jpg')).toEqual(['http://x/b.jpg']);
    });
});
