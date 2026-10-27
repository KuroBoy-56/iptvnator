import { StalkerVodInfo, XtreamSerieEpisode, XtreamSerieInfo } from '@iptvnator/shared/interfaces';
import { mergeEpisodesWithTmdb } from './tmdb-episode-merge';
import { mergeSerieInfoWithTmdb, mergeStalkerInfoWithTmdb, mergeVodInfoWithTmdb } from './tmdb-merge';
import { TmdbEpisode, TmdbMovieDetails, TmdbTvDetails } from './tmdb.types';
import { providerVodInfo } from './tmdb-merge.fixtures';

describe('synopsis follows the app language', () => {
    const frMovie: TmdbMovieDetails = { id: 603, title: 'Matrix', overview: 'Synopsis en français' };
    const frTv: TmdbTvDetails = { id: 70523, name: 'Dark', overview: 'Synopsis de la série' };
    const stalkerInfo: StalkerVodInfo = {
        movie_image: '',
        description: 'Sinopsis del proveedor',
        name: 'Matrix',
        o_name: undefined,
        actors: '',
        director: '',
        releasedate: '',
        genre: '',
        rating_imdb: '',
        rating_kinopoisk: '',
    };
    const serieInfo = { name: 'Dark', plot: 'Sinopsis del proveedor' } as XtreamSerieInfo;

    it('uses the TMDB overview of the app language over the provider plot', () => {
        const vod = mergeVodInfoWithTmdb(
            providerVodInfo({ plot: 'Sinopsis del proveedor', description: 'Sinopsis del proveedor' }),
            frMovie
        );
        expect(vod.plot).toBe('Synopsis en français');
        expect(vod.description).toBe('Synopsis en français');
        expect(mergeSerieInfoWithTmdb(serieInfo, frTv).plot).toBe('Synopsis de la série');
        expect(mergeStalkerInfoWithTmdb(stalkerInfo, frMovie, 'movie').description).toBe('Synopsis en français');
    });

    it('keeps the provider plot when TMDB has no overview in the app language', () => {
        for (const overview of [undefined, '', '   ']) {
            const vod = mergeVodInfoWithTmdb(
                providerVodInfo({ plot: 'Sinopsis del proveedor', description: 'Sinopsis del proveedor' }),
                { ...frMovie, overview }
            );
            expect(vod.plot).toBe('Sinopsis del proveedor');
            expect(vod.description).toBe('Sinopsis del proveedor');
            expect(mergeSerieInfoWithTmdb(serieInfo, { ...frTv, overview }).plot).toBe('Sinopsis del proveedor');
            expect(
                mergeStalkerInfoWithTmdb(stalkerInfo, { ...frMovie, overview }, 'movie').description
            ).toBe('Sinopsis del proveedor');
        }
    });

    it('applies the same rule to episode overviews of a TMDB season', () => {
        const episode = {
            id: '1',
            episode_num: 4,
            title: 'Episodio 4',
            container_extension: 'mp4',
            info: { plot: 'Sinopsis del episodio (proveedor)' },
            custom_sid: '',
            added: '',
            season: 1,
            direct_source: '',
        } as unknown as XtreamSerieEpisode;
        const tmdbEpisode = (overview?: string): TmdbEpisode => ({
            episode_number: 4,
            season_number: 1,
            name: 'Épisode quatre',
            overview,
        });
        const plotOf = (e: XtreamSerieEpisode) => (e.info as { plot?: string }).plot;

        expect(plotOf(mergeEpisodesWithTmdb([episode], [tmdbEpisode('Résumé en français')])[0])).toBe(
            'Résumé en français'
        );
        expect(plotOf(mergeEpisodesWithTmdb([episode], [tmdbEpisode('  ')])[0])).toBe(
            'Sinopsis del episodio (proveedor)'
        );
        expect(plotOf(mergeEpisodesWithTmdb([episode], [tmdbEpisode(undefined)])[0])).toBe(
            'Sinopsis del episodio (proveedor)'
        );
    });

    it('uses an original-language fallback overview only when the provider plot is empty', () => {
        const korean = { overview: '한국어 줄거리', overviewFromFallback: true };
        const vod = mergeVodInfoWithTmdb(
            providerVodInfo({ plot: 'Sinopsis del proveedor', description: 'Sinopsis del proveedor' }),
            { ...frMovie, ...korean }
        );
        expect(vod.plot).toBe('Sinopsis del proveedor');
        expect(vod.description).toBe('Sinopsis del proveedor');
        expect(mergeSerieInfoWithTmdb(serieInfo, { ...frTv, ...korean }).plot).toBe('Sinopsis del proveedor');
        expect(
            mergeStalkerInfoWithTmdb(stalkerInfo, { ...frMovie, ...korean }, 'movie').description
        ).toBe('Sinopsis del proveedor');

        // no provider plot: the fallback overview is better than nothing
        const empty = mergeVodInfoWithTmdb(providerVodInfo({ plot: '', description: '' }), { ...frMovie, ...korean });
        expect(empty.plot).toBe('한국어 줄거리');
        expect(empty.description).toBe('한국어 줄거리');
        expect(mergeSerieInfoWithTmdb({ ...serieInfo, plot: '' }, { ...frTv, ...korean }).plot).toBe('한국어 줄거리');
        expect(
            mergeStalkerInfoWithTmdb({ ...stalkerInfo, description: '' }, { ...frMovie, ...korean }, 'movie').description
        ).toBe('한국어 줄거리');
    });

    it('applies the fallback rule to episode overviews too', () => {
        const episode = (plot: string) =>
            ({
                id: '1',
                episode_num: 4,
                title: 'Episodio 4',
                container_extension: 'mp4',
                info: plot ? { plot } : {},
                custom_sid: '',
                added: '',
                season: 1,
                direct_source: '',
            }) as unknown as XtreamSerieEpisode;
        const korean: TmdbEpisode = { episode_number: 4, overview: '에피소드 줄거리', overviewFromFallback: true };
        const plotOf = (e: XtreamSerieEpisode) => (e.info as { plot?: string }).plot;

        expect(plotOf(mergeEpisodesWithTmdb([episode('Sinopsis del proveedor')], [korean])[0])).toBe('Sinopsis del proveedor');
        expect(plotOf(mergeEpisodesWithTmdb([episode('')], [korean])[0])).toBe('에피소드 줄거리');
    });
});
