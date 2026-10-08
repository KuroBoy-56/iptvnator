import { ChangeDetectionStrategy, Component, computed } from '@angular/core';
import { RouterLink } from '@angular/router';
import { injectNfCatalog } from './nf-catalog';
import {
    NF_GENRES,
    NF_HOME_GENRES,
    NF_PLATFORMS,
    nfAvailable,
    nfTagItems,
    NfTag,
} from './nf-filters';
import { NfHeroComponent } from './nf-hero.component';
import { dailyShuffle, newestFirst, NfItem, topRated } from './nf-item';
import { NfRowComponent } from './nf-row.component';

interface HomeRow {
    key: string;
    title: string;
    items: NfItem[];
    more: string[] | null;
    query?: Record<string, string>;
    variant?: '' | 'top';
}

const PLATFORM_ROWS = 5;

/** "Inicio": the web player's home (homex.php) with the same rows and order. */
@Component({
    selector: 'app-nf-home',
    standalone: true,
    imports: [NfHeroComponent, NfRowComponent, RouterLink],
    template: `
        <div class="nf-page">
            <app-nf-hero
                [slides]="catalog.heroSlides()"
                [playlistId]="catalog.playlistId()"
                kicker="Destacado"
            />

            @if (platforms().length) {
                <nav class="nf-platforms" aria-label="Plataformas">
                    @for (p of platforms(); track p.key) {
                        <a
                            class="nf-plat"
                            [routerLink]="explore"
                            [queryParams]="{ platform: p.key }"
                            [title]="p.label"
                        >
                            @if (p.img) {
                                <img
                                    [src]="p.img"
                                    [alt]="p.label"
                                    loading="lazy"
                                />
                            } @else {
                                <span class="txt" [style.color]="p.color">{{
                                    p.label
                                }}</span>
                            }
                        </a>
                    }
                </nav>
            }

            <div class="nf-rows">
                @if (library(); as lib) {
                    @if (lib.continueWatching.length) {
                        <app-nf-row
                            title="Continuar viendo"
                            [items]="lib.continueWatching"
                            [playlistId]="catalog.playlistId()"
                            [more]="libraryLink('continue-watching')"
                            [limit]="20"
                        />
                    }
                    @if (lib.myList.length) {
                        <app-nf-row
                            title="Mi lista"
                            [items]="lib.myList"
                            [playlistId]="catalog.playlistId()"
                            [more]="libraryLink('my-list')"
                            [limit]="60"
                        />
                    }
                }
                @if (catalog.ready()) {
                    @for (row of rows(); track row.key) {
                        <app-nf-row
                            [title]="row.title"
                            [items]="row.items"
                            [playlistId]="catalog.playlistId()"
                            [more]="row.more"
                            [moreQuery]="row.query ?? null"
                            [variant]="row.variant ?? ''"
                        />
                    }
                } @else if (catalog.loading()) {
                    <app-nf-row
                        title="Top 10 de hoy"
                        [items]="null"
                        [playlistId]="catalog.playlistId()"
                    />
                    <app-nf-row
                        title="Películas agregadas recientemente"
                        [items]="null"
                        [playlistId]="catalog.playlistId()"
                    />
                    <app-nf-row
                        title="Series nuevas"
                        [items]="null"
                        [playlistId]="catalog.playlistId()"
                    />
                } @else {
                    <p class="nf-empty">
                        Aún no hay películas ni series en tu lista.
                    </p>
                }
            </div>
        </div>
    `,
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NfHomeComponent {
    protected readonly catalog = injectNfCatalog(['movie', 'series'], true);
    protected readonly library = this.catalog.library;

    protected get explore(): string[] {
        return ['/workspace', 'xtreams', this.catalog.playlistId(), 'explore'];
    }

    /** "Ver todo" of the panel rows: the full list, same order. */
    protected libraryLink(page: 'continue-watching' | 'my-list'): string[] {
        return ['/workspace', 'xtreams', this.catalog.playlistId(), page];
    }

    private readonly allCategories = computed(() => [
        ...this.catalog.movieCategories(),
        ...this.catalog.seriesCategories(),
    ]);
    private readonly allItems = computed(() => [
        ...this.catalog.movies(),
        ...this.catalog.series(),
    ]);

    protected readonly platforms = computed(() =>
        nfAvailable(NF_PLATFORMS, this.allCategories())
    );

    protected readonly rows = computed<HomeRow[]>(() => {
        const movies = this.catalog.movies();
        const series = this.catalog.series();
        const explore = this.explore;
        const rows: HomeRow[] = [
            {
                key: 'top',
                title: 'Top 10 de hoy',
                items: topRated(newestFirst(movies).slice(0, 300)),
                more: explore,
                query: { type: 'all', sort: 'rating' },
                variant: 'top',
            },
            {
                key: 'movies',
                title: 'Películas agregadas recientemente',
                items: newestFirst(movies),
                more: explore,
                query: { type: 'movie', sort: 'recent' },
            },
            {
                key: 'series',
                title: 'Series nuevas',
                items: newestFirst(series),
                more: explore,
                query: { type: 'series', sort: 'recent' },
            },
        ];
        const platformRows = this.platforms()
            .filter((p) => p.key !== 'xmas' && p.key !== 'halloween')
            .slice(0, PLATFORM_ROWS);
        for (const p of platformRows)
            rows.push(this.tagRow(p, 'Lo mejor de ' + p.label));
        rows.push({
            key: 'series-for-you',
            title: 'Series para ti',
            items: dailyShuffle(series, 'series').slice(0, 24),
            more: [
                '/workspace',
                'xtreams',
                this.catalog.playlistId(),
                'series',
            ],
        });
        const genres = nfAvailable(NF_GENRES, this.allCategories());
        for (const key of NF_HOME_GENRES) {
            const genre = genres.find((g) => g.key === key);
            if (genre) rows.push(this.tagRow(genre, genre.label));
        }
        rows.push({
            key: 'movies-for-you',
            title: 'Películas para ti',
            items: dailyShuffle(movies, 'movies').slice(0, 24),
            more: ['/workspace', 'xtreams', this.catalog.playlistId(), 'vod'],
        });
        return rows.filter((r) => r.items.length > 0);
    });

    private tagRow(tag: NfTag, title: string): HomeRow {
        const isPlatform = NF_PLATFORMS.includes(tag);
        return {
            key: tag.key,
            title,
            items: newestFirst(
                nfTagItems(this.allItems(), this.allCategories(), tag)
            ).slice(0, 30),
            more: this.explore,
            query: isPlatform ? { platform: tag.key } : { genre: tag.key },
        };
    }
}
