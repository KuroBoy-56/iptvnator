import { computed, effect, inject, signal, untracked } from '@angular/core';
import { XtreamStore } from '@iptvnator/portal/xtream/data-access';
import { NfHeroService, NfHeroSlide } from './nf-hero.service';
import { NfItem, toNfItems } from './nf-item';
import { NfLibrary, NfLibraryService } from './nf-library.service';

export interface NfCategory {
    /** Same id the category routes and the store filter use. */
    id: string;
    name: string;
}

type RawCategory = Record<string, unknown>;

function toCategories(list: readonly unknown[]): NfCategory[] {
    const out: NfCategory[] = [];
    for (const raw of list as RawCategory[]) {
        if (!raw || raw['hidden'] === true || raw['hidden'] === 1) continue;
        const id = String(raw['id'] ?? raw['category_id'] ?? '');
        const name = String(raw['name'] ?? raw['category_name'] ?? '').trim();
        if (id && name) out.push({ id, name });
    }
    return out;
}

/**
 * Shared data for the Netflix pages (Inicio, Películas, Series): the loaded
 * catalog as posters, categories, billboard slides and the panel lists.
 * Call from a component constructor (uses inject()).
 */
export function injectNfCatalog(
    heroTypes: ('movie' | 'series')[],
    withLibrary = false
) {
    const store = inject(XtreamStore);
    const heroService = inject(NfHeroService);
    const libraryService = inject(NfLibraryService);

    const playlistId = computed(
        () => store.playlistId() ?? store.currentPlaylist()?.id ?? ''
    );
    const movies = computed(() =>
        toNfItems(store.vodStreams() as unknown[], 'movie')
    );
    const series = computed(() =>
        toNfItems(store.serialStreams() as unknown[], 'series')
    );
    const movieCategories = computed(() =>
        toCategories(store.vodCategories() as unknown[])
    );
    const seriesCategories = computed(() =>
        toCategories(store.serialCategories() as unknown[])
    );
    const ready = computed(() => movies().length > 0 || series().length > 0);

    const heroSlides = signal<NfHeroSlide[] | null>(
        heroTypes.length ? null : []
    );
    const library = signal<NfLibrary | null>(null);

    effect(() => {
        const playlist = store.currentPlaylist();
        if (!ready() || !playlist?.serverUrl) return;
        const pools = heroTypes.map((t) =>
            t === 'movie' ? movies() : series()
        );
        untracked(() => {
            const key = `${playlist.id}|${heroTypes.join(',')}`;
            if (heroTypes.length) {
                void heroService
                    .slides(
                        key,
                        {
                            serverUrl: playlist.serverUrl,
                            username: playlist.username,
                            password: playlist.password,
                        },
                        pools
                    )
                    .then((slides) => heroSlides.set(slides));
            }
            if (!withLibrary) return;
            void libraryService
                .load(
                    {
                        username: playlist.username,
                        password: playlist.password,
                        server: playlist.serverUrl,
                    },
                    movies(),
                    series()
                )
                .then((lib) => library.set(lib))
                .catch(() => library.set({ continueWatching: [], myList: [] }));
        });
    });

    function byCategory(items: NfItem[]): Map<string, NfItem[]> {
        const map = new Map<string, NfItem[]>();
        for (const item of items) {
            const list = map.get(item.categoryId);
            if (list) list.push(item);
            else map.set(item.categoryId, [item]);
        }
        return map;
    }

    const loading = computed(
        () =>
            !ready() &&
            (store.isLoadingContent() ||
                store.isImporting() ||
                !store.isContentInitialized())
    );

    return {
        store,
        playlistId,
        movies,
        series,
        movieCategories,
        seriesCategories,
        ready,
        loading,
        // empty catalog: no billboard instead of an endless shimmer
        heroSlides: computed(() =>
            !ready() && !loading() ? [] : heroSlides()
        ),
        library,
        byCategory,
    };
}

export type NfCatalog = ReturnType<typeof injectNfCatalog>;
