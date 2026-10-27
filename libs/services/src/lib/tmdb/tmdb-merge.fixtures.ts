import { XtreamVodInfo } from '@iptvnator/shared/interfaces';
import { TmdbMovieDetails } from './tmdb.types';

/** Provider VOD info and TMDB movie shared by the TMDB merge specs. */
export function providerVodInfo(overrides: Partial<XtreamVodInfo> = {}): XtreamVodInfo {
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

export const tmdbMovie: TmdbMovieDetails = {
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
