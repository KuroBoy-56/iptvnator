import { NfItem } from './nf-item';

/** Keyword groups, same tables as the web player (includes/core.php). */
export interface NfTag {
    key: string;
    label: string;
    kw: (string | RegExp)[];
    /** Platform tiles only. */
    img?: string;
    color?: string;
}

const IMG = './assets/images/platforms/';

export const NF_PLATFORMS: NfTag[] = [
    {
        key: 'netflix',
        label: 'Netflix',
        img: IMG + 'netflix.webp',
        kw: ['netflix'],
        color: '#e50914',
    },
    {
        key: 'disney',
        label: 'Disney+',
        img: IMG + 'disney.webp',
        kw: ['disney', 'pixar', 'star+', 'star plus'],
        color: '#113ccf',
    },
    {
        key: 'max',
        label: 'HBO Max',
        img: IMG + 'max.webp',
        kw: ['hbo', /\bmax\b/],
        color: '#5822b4',
    },
    {
        key: 'prime',
        label: 'Prime Video',
        img: IMG + 'prime.webp',
        kw: ['amazon', 'prime'],
        color: '#00a8e1',
    },
    {
        key: 'marvel',
        label: 'Marvel',
        img: IMG + 'marvel.webp',
        kw: ['marvel', /\bmcu\b/],
        color: '#ec1d24',
    },
    { key: 'apple', label: 'Apple TV+', kw: ['apple'], color: '#555' },
    {
        key: 'paramount',
        label: 'Paramount+',
        kw: ['paramount'],
        color: '#0064ff',
    },
    { key: 'dc', label: 'DC', kw: [/\bdc\b/, 'dc comics'], color: '#0476f2' },
    {
        key: 'xmas',
        label: 'Navidad',
        img: IMG + 'xmas.webp',
        kw: ['navidad', 'navide', 'christmas', 'xmas'],
        color: '#1f7a3a',
    },
    {
        key: 'halloween',
        label: 'Halloween',
        img: IMG + 'halloween.webp',
        kw: ['halloween', 'terror', 'horror'],
        color: '#ff6a00',
    },
];

export const NF_GENRES: NfTag[] = [
    {
        key: 'accion',
        label: 'Acción',
        kw: ['accion', 'action', 'artes marciales'],
    },
    {
        key: 'suspenso',
        label: 'Suspenso',
        kw: [
            'suspenso',
            'suspense',
            'thriller',
            'misterio',
            'mystery',
            'intriga',
        ],
    },
    { key: 'aventura', label: 'Aventura', kw: ['aventura', 'adventure'] },
    { key: 'anime', label: 'Anime', kw: ['anime', 'crunchyroll', 'otaku'] },
    { key: 'drama', label: 'Drama', kw: ['drama'] },
    { key: 'comedia', label: 'Comedia', kw: ['comedia', 'comedy', 'humor'] },
    { key: 'terror', label: 'Terror', kw: ['terror', 'horror', 'miedo'] },
    {
        key: 'scifi',
        label: 'Ciencia ficción',
        kw: [
            'ciencia ficcion',
            'sci-fi',
            'scifi',
            'science fiction',
            'ficcion',
        ],
    },
    { key: 'fantasia', label: 'Fantasía', kw: ['fantasia', 'fantasy'] },
    {
        key: 'romance',
        label: 'Romance',
        kw: ['romance', 'romantic', 'romantica', 'romantico', 'amor'],
    },
    {
        key: 'crimen',
        label: 'Crimen',
        kw: ['crimen', 'crime', 'policia', 'policiaco', 'mafia'],
    },
    {
        key: 'animacion',
        label: 'Animación',
        kw: [
            'animacion',
            'animation',
            'animada',
            'animado',
            'cartoon',
            'dibujos',
        ],
    },
    {
        key: 'infantil',
        label: 'Infantil y familia',
        kw: ['infantil', 'kids', 'ninos', 'familia', 'family', 'familiar'],
    },
    {
        key: 'documental',
        label: 'Documentales',
        kw: ['documental', 'documentary', 'docu'],
    },
    {
        key: 'belica',
        label: 'Bélicas',
        kw: ['belica', 'belico', 'guerra', 'war'],
    },
    {
        key: 'dorama',
        label: 'Doramas',
        kw: ['dorama', 'k-drama', 'kdrama', 'corea', 'korean', 'asiatic'],
    },
    { key: 'novela', label: 'Novelas', kw: ['novela', 'telenovela'] },
    { key: 'western', label: 'Western', kw: ['western', 'vaquer', 'oeste'] },
    {
        key: 'musical',
        label: 'Música',
        kw: ['musical', 'music', 'musica', 'concierto'],
    },
    { key: 'deportes', label: 'Deportes', kw: ['deporte', 'sport', 'futbol'] },
];

/** Genre rows on Inicio, in the web player's order. */
export const NF_HOME_GENRES = [
    'accion',
    'comedia',
    'terror',
    'anime',
    'drama',
    'suspenso',
    'aventura',
    'infantil',
    'scifi',
    'romance',
    'documental',
];

export function nfNorm(text: string): string {
    return text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

export function nfMatches(text: string, tag: NfTag): boolean {
    const t = nfNorm(text);
    return tag.kw.some((kw) =>
        typeof kw === 'string' ? t.includes(kw) : kw.test(t)
    );
}

export interface NfNamedCategory {
    id: string;
    name: string;
}

/** Ids of the categories whose name matches the tag. */
export function nfCategoryIds(
    categories: NfNamedCategory[],
    tag: NfTag
): Set<string> {
    return new Set(
        categories.filter((c) => nfMatches(c.name, tag)).map((c) => c.id)
    );
}

/** Items whose category name matches the tag. */
export function nfTagItems(
    items: NfItem[],
    categories: NfNamedCategory[],
    tag: NfTag
): NfItem[] {
    const ids = nfCategoryIds(categories, tag);
    return items.filter((i) => ids.has(i.categoryId));
}

/** Tags that have at least one category in the catalog. */
export function nfAvailable(
    tags: NfTag[],
    categories: NfNamedCategory[]
): NfTag[] {
    return tags.filter((tag) => categories.some((c) => nfMatches(c.name, tag)));
}

export function nfFindTag(key: string | null | undefined): NfTag | null {
    return [...NF_PLATFORMS, ...NF_GENRES].find((t) => t.key === key) ?? null;
}
