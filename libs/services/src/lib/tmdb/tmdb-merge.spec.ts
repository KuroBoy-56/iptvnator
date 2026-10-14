import {
    StalkerVodInfo,
    XtreamSerieEpisode,
    XtreamSerieInfo,
    XtreamVodInfo,
} from '@iptvnator/shared/interfaces';
import { mergeEpisodesWithTmdb } from './tmdb-episode-merge';
import {
    mergeSerieInfoWithTmdb,
    mergeStalkerInfoWithTmdb,
    mergeVodInfoWithTmdb,
} from './tmdb-merge';
import { TmdbEpisode, TmdbMovieDetails, TmdbTvDetails } from './tmdb.types';

function providerVodInfo(overrides: Partial<XtreamVodInfo> = {}): XtreamVodInfo {
    return {
        kinopoisk_url: '',
        tmdb_id: '',
        name: 'The Matrix',
        o_name: 'The Matrix',
        cover_big: 'http://provider/poster-big.jpg',
        movie_image: 'http://provider/poster.jpg',
        releasedate: '1999-03-31',
        episode_run_time: 0,
        youtube_trailer: 'provider-trailer',
        director: 'Provider Director',
        actors: 'Provider Actor',
        cast: 'Provider Actor',
        description: 'Provider description',
        plot: 'Provider plot',
        age: '',
        mpaa_rating: 'R',
        rating_count_kinopoisk: 0,
        country: 'USA',
        genre: 'Action',
        backdrop_path: ['http://provider/backdrop.jpg'],
        duration_secs: 8160,
        duration: '02:16:00',
        video: [],
        audio: [],
        bitrate: 0,
        rating: 7,
        ...overrides,
    };
}

const tmdbMovie: TmdbMovieDetails = {
    id: 603,
    title: 'The Matrix',
    overview: 'TMDB overview',
    genres: [
        { id: 28, name: 'Action' },
        { id: 878, name: 'Science Fiction' },
    ],
    release_date: '1999-03-31',
    runtime: 136,
    vote_average: 8.22,
    vote_count: 26000,
    poster_path: '/matrix-poster.jpg',
    backdrop_path: '/matrix-backdrop.jpg',
    production_countries: [{ iso_3166_1: 'US', name: 'United States' }],
    credits: {
        cast: [
            {
                name: 'Keanu Reeves',
                order: 0,
                character: 'Neo',
                profile_path: '/keanu.jpg',
            },
            { name: 'Laurence Fishburne', order: 1, profile_path: null },
        ],
        crew: [
            { name: 'Lana Wachowski', job: 'Director' },
            { name: 'Lilly Wachowski', job: 'Director' },
            { name: 'Someone Else', job: 'Producer' },
        ],
    },
    videos: {
        results: [
            { key: 'fan-clip', site: 'YouTube', type: 'Clip' },
            {
                key: 'official-trailer',
                site: 'YouTube',
                type: 'Trailer',
                official: true,
            },
            { key: 'vimeo-trailer', site: 'Vimeo', type: 'Trailer' },
        ],
    },
    recommendations: {
        results: [
            {
                id: 604,
                title: 'The Matrix Reloaded',
                release_date: '2003-05-15',
                poster_path: '/reloaded.jpg',
            },
            { id: 605, title: 'The Matrix Revolutions' },
        ],
    },
};

describe('mergeVodInfoWithTmdb', () => {
    it('prefers TMDB editorial fields when present', () => {
        const merged = mergeVodInfoWithTmdb(providerVodInfo(), tmdbMovie);

        expect(merged.plot).toBe('TMDB overview');
        expect(merged.description).toBe('TMDB overview');
        expect(merged.cast).toBe('Keanu Reeves, Laurence Fishburne');
        expect(merged.actors).toBe('Keanu Reeves, Laurence Fishburne');
        expect(merged.director).toBe('Lana Wachowski, Lilly Wachowski');
        expect(merged.genre).toBe('Action, Science Fiction');
        expect(merged.rating).toBe(8.2);
        expect(merged.tmdb_id).toBe(603);
        expect(merged.movie_image).toBe(
            'https://image.tmdb.org/t/p/w500/matrix-poster.jpg'
        );
        expect(merged.backdrop_path[0]).toBe(
            'https://image.tmdb.org/t/p/w1280/matrix-backdrop.jpg'
        );
        expect(merged.backdrop_path).toContain('http://provider/backdrop.jpg');
        expect(merged.tmdb_cast).toEqual([
            {
                name: 'Keanu Reeves',
                character: 'Neo',
                profileUrl: 'https://image.tmdb.org/t/p/w185/keanu.jpg',
            },
            { name: 'Laurence Fishburne', profileUrl: null },
        ]);
    });

    it('prefers the official YouTube trailer', () => {
        const merged = mergeVodInfoWithTmdb(providerVodInfo(), tmdbMovie);
        expect(merged.youtube_trailer).toBe('official-trailer');
    });

    it('keeps the provider trailer when TMDB has no usable video', () => {
        const merged = mergeVodInfoWithTmdb(providerVodInfo(), {
            ...tmdbMovie,
            videos: { results: [{ key: 'x', site: 'Vimeo', type: 'Trailer' }] },
        });
        expect(merged.youtube_trailer).toBe('provider-trailer');
    });

    it('attaches recommendations with year and poster', () => {
        const merged = mergeVodInfoWithTmdb(providerVodInfo(), tmdbMovie);
        expect(merged.tmdb_recommendations).toEqual([
            {
                tmdbId: 604,
                title: 'The Matrix Reloaded',
                year: 2003,
                posterUrl: 'https://image.tmdb.org/t/p/w500/reloaded.jpg',
            },
            {
                tmdbId: 605,
                title: 'The Matrix Revolutions',
                year: null,
                posterUrl: null,
            },
        ]);
    });

    it('keeps provider values when TMDB fields are missing', () => {
        const sparse: TmdbMovieDetails = { id: 603 };
        const info = providerVodInfo();
        const merged = mergeVodInfoWithTmdb(info, sparse);

        expect(merged.plot).toBe('Provider plot');
        expect(merged.cast).toBe('Provider Actor');
        expect(merged.director).toBe('Provider Director');
        expect(merged.genre).toBe('Action');
        expect(merged.rating).toBe(7);
        expect(merged.movie_image).toBe('http://provider/poster.jpg');
        expect(merged.tmdb_cast).toBeUndefined();
        expect(merged.backdrop_path).toEqual([
            'http://provider/backdrop.jpg',
        ]);
    });

    it('ignores TMDB rating without votes', () => {
        const unrated: TmdbMovieDetails = {
            id: 603,
            vote_average: 5,
            vote_count: 0,
        };
        const merged = mergeVodInfoWithTmdb(providerVodInfo(), unrated);
        expect(merged.rating).toBe(7);
    });

    it('fills the displayed rating_imdb field only when the provider left it empty', () => {
        const withoutImdb = mergeVodInfoWithTmdb(
            providerVodInfo({ rating_imdb: '' }),
            tmdbMovie
        );
        expect(withoutImdb.rating_imdb).toBe('8.2');

        const withImdb = mergeVodInfoWithTmdb(
            providerVodInfo({ rating_imdb: '7.9' }),
            tmdbMovie
        );
        expect(withImdb.rating_imdb).toBe('7.9');
    });

    it('fills missing provider release date and country', () => {
        const info = providerVodInfo({ releasedate: '', country: '' });
        const merged = mergeVodInfoWithTmdb(info, tmdbMovie);
        expect(merged.releasedate).toBe('1999-03-31');
        expect(merged.country).toBe('United States');
    });

    it('does not mutate the provider object', () => {
        const info = providerVodInfo();
        const snapshot = JSON.parse(JSON.stringify(info));
        mergeVodInfoWithTmdb(info, tmdbMovie);
        expect(info).toEqual(snapshot);
    });
});

describe('mergeSerieInfoWithTmdb', () => {
    const providerSerieInfo: XtreamSerieInfo = {
        name: 'Dark',
        cover: 'http://provider/cover.jpg',
        plot: 'Provider plot',
        cast: 'Provider Cast',
        director: '',
        genre: 'Drama',
        releaseDate: '',
        last_modified: '',
        rating: '7',
        rating_5based: 3.5,
        backdrop_path: ['http://provider/backdrop.jpg'],
        youtube_trailer: '',
        episode_run_time: '60',
        category_id: '1',
    };

    const tmdbTv: TmdbTvDetails = {
        id: 70523,
        name: 'Dark',
        overview: 'TMDB tv overview',
        genres: [{ id: 9648, name: 'Mystery' }],
        first_air_date: '2017-12-01',
        vote_average: 8.4,
        vote_count: 3200,
        poster_path: '/dark-poster.jpg',
        backdrop_path: '/dark-backdrop.jpg',
        created_by: [{ name: 'Baran bo Odar' }, { name: 'Jantje Friese' }],
        credits: {
            cast: [{ name: 'Louis Hofmann', order: 0 }],
        },
    };

    it('prefers TMDB fields and fills gaps', () => {
        const merged = mergeSerieInfoWithTmdb(providerSerieInfo, tmdbTv);

        expect(merged.plot).toBe('TMDB tv overview');
        expect(merged.cast).toBe('Louis Hofmann');
        expect(merged.director).toBe('Baran bo Odar, Jantje Friese');
        expect(merged.genre).toBe('Mystery');
        expect(merged.rating).toBe('8.4');
        expect(merged.rating_5based).toBe(4.2);
        expect(merged.releaseDate).toBe('2017-12-01');
        expect(merged.cover).toBe(
            'https://image.tmdb.org/t/p/w500/dark-poster.jpg'
        );
        expect(merged.backdrop_path[0]).toBe(
            'https://image.tmdb.org/t/p/w1280/dark-backdrop.jpg'
        );
    });

    it('keeps provider values for missing TMDB fields', () => {
        const merged = mergeSerieInfoWithTmdb(providerSerieInfo, {
            id: 70523,
        });

        expect(merged.plot).toBe('Provider plot');
        expect(merged.cast).toBe('Provider Cast');
        expect(merged.genre).toBe('Drama');
        expect(merged.rating).toBe('7');
        expect(merged.rating_5based).toBe(3.5);
        expect(merged.cover).toBe('http://provider/cover.jpg');
    });
});

describe('mergeStalkerInfoWithTmdb', () => {
    const providerStalkerInfo: StalkerVodInfo = {
        movie_image: '',
        description: '',
        name: 'Ирония судьбы, или С лёгким паром!',
        o_name: undefined,
        actors: 'Провайдерский актёр',
        director: '',
        releasedate: '1976',
        genre: '',
        rating_imdb: '',
        rating_kinopoisk: '8.1',
    };

    const tmdbMovieRu: TmdbMovieDetails = {
        id: 20992,
        title: 'Ирония судьбы, или С лёгким паром!',
        overview: 'Описание из TMDB',
        genres: [{ id: 35, name: 'комедия' }],
        release_date: '1976-01-01',
        vote_average: 7.9,
        vote_count: 250,
        poster_path: '/irony-poster.jpg',
        backdrop_path: '/irony-backdrop.jpg',
        credits: {
            cast: [
                {
                    name: 'Андрей Мягков',
                    order: 0,
                    profile_path: '/myagkov.jpg',
                },
            ],
            crew: [{ name: 'Эльдар Рязанов', job: 'Director' }],
        },
    };

    it('prefers TMDB editorial fields and attaches cast/backdrop', () => {
        const merged = mergeStalkerInfoWithTmdb(
            providerStalkerInfo,
            tmdbMovieRu,
            'movie'
        );

        expect(merged.description).toBe('Описание из TMDB');
        expect(merged.actors).toBe('Андрей Мягков');
        expect(merged.director).toBe('Эльдар Рязанов');
        expect(merged.genre).toBe('комедия');
        expect(merged.movie_image).toBe(
            'https://image.tmdb.org/t/p/w500/irony-poster.jpg'
        );
        expect(merged.tmdb_backdrop).toBe(
            'https://image.tmdb.org/t/p/w1280/irony-backdrop.jpg'
        );
        expect(merged.tmdb_cast).toEqual([
            {
                name: 'Андрей Мягков',
                profileUrl: 'https://image.tmdb.org/t/p/w185/myagkov.jpg',
            },
        ]);
        // Provider keeps its own fields where TMDB should not win
        expect(merged.name).toBe('Ирония судьбы, или С лёгким паром!');
        expect(merged.rating_kinopoisk).toBe('8.1');
        expect(merged.releasedate).toBe('1976');
    });

    it('only fills rating_imdb when the provider left it empty', () => {
        const merged = mergeStalkerInfoWithTmdb(
            providerStalkerInfo,
            tmdbMovieRu,
            'movie'
        );
        expect(merged.rating_imdb).toBe('7.9');

        const withProviderRating = mergeStalkerInfoWithTmdb(
            { ...providerStalkerInfo, rating_imdb: '8.4' },
            tmdbMovieRu,
            'movie'
        );
        expect(withProviderRating.rating_imdb).toBe('8.4');
    });

    it('uses series creators as director for tv items', () => {
        const tv: TmdbTvDetails = {
            id: 1,
            overview: 'tv overview',
            created_by: [{ name: 'Создатель Сериала' }],
        };
        const merged = mergeStalkerInfoWithTmdb(providerStalkerInfo, tv, 'tv');
        expect(merged.director).toBe('Создатель Сериала');
    });

    it('keeps provider values for missing TMDB fields', () => {
        const merged = mergeStalkerInfoWithTmdb(
            { ...providerStalkerInfo, description: 'Провайдерский сюжет' },
            { id: 20992 },
            'movie'
        );

        expect(merged.description).toBe('Провайдерский сюжет');
        expect(merged.actors).toBe('Провайдерский актёр');
        expect(merged.tmdb_cast).toBeUndefined();
        expect(merged.tmdb_backdrop).toBeUndefined();
    });
});

/**
 * Synopsis in the app language: TMDB details are fetched in the app
 * language (es-MX, en-US, pt-BR, fr-FR), so a non-empty TMDB overview must
 * replace the provider's (Spanish) plot; an empty one keeps the provider
 * plot. Spanish behaves the same way as before.
 */
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
