import {
    ChangeDetectionStrategy,
    Component,
    computed,
    inject,
    linkedSignal,
    signal,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { NfCardComponent } from './nf-card.component';
import { injectNfCatalog } from './nf-catalog';
import { nfFindTag, nfNorm, nfTagItems } from './nf-filters';
import { NfItem, nfLink, newestFirst, topRated } from './nf-item';
import { NfNearEndDirective } from './nf-near-end.directive';

type ExploreType = 'all' | 'movie' | 'series';
type ExploreSort = 'recent' | 'rating' | 'az';

const PAGE = 120;

/** "Ver todo", platforms, genres and categories as a poster grid (web player browse.php). */
@Component({
    selector: 'app-nf-explore',
    standalone: true,
    imports: [NfCardComponent, NfNearEndDirective, RouterLink],
    template: `
        <div class="nf-page">
            <header class="nf-browse-head" [style.--accent]="accent()">
                <h1>
                    @if (tag()?.img; as img) {
                        <img [src]="img" alt="" />
                    }
                    {{ heading() }}
                </h1>
                <p>{{ subtitle() }}</p>
            </header>

            <div class="nf-filterbar">
                <div class="row1">
                    @if (!category()) {
                        <div class="nf-seg" role="group" aria-label="Tipo">
                            @for (t of types; track t.key) {
                                <button
                                    type="button"
                                    [class.active]="type() === t.key"
                                    (click)="set({ type: t.key })"
                                >
                                    {{ t.label }}
                                </button>
                            }
                        </div>
                    }
                    <select
                        class="nf-select"
                        aria-label="Ordenar"
                        [value]="sort()"
                        (change)="set({ sort: $any($event.target).value })"
                    >
                        <option value="recent">Agregadas recientemente</option>
                        <option value="rating">Mejor valoradas</option>
                        <option value="az">A – Z</option>
                    </select>
                    <input
                        class="nf-input"
                        type="search"
                        placeholder="Filtrar por título"
                        [value]="filter()"
                        (input)="filter.set($any($event.target).value)"
                    />
                    <span class="nf-count">{{ results().length }} títulos</span>
                </div>
            </div>

            @if (catalog.ready()) {
                @if (results().length) {
                    <div class="nf-grid">
                        @for (item of shown(); track item.type + item.id) {
                            <a
                                nfCard
                                [item]="item"
                                [routerLink]="link(item)"
                            ></a>
                        }
                    </div>
                    @if (shown().length < results().length) {
                        @for (step of [shown().length]; track step) {
                            <div
                                class="nf-grid-status"
                                (nfNearEnd)="limit.set(limit() + page)"
                            >
                                Cargando más…
                            </div>
                        }
                    }
                } @else {
                    <p class="nf-empty">
                        No encontramos títulos con estos filtros.
                    </p>
                }
            } @else {
                <p class="nf-grid-status">
                    {{
                        catalog.loading()
                            ? 'Cargando catálogo…'
                            : 'Aún no hay contenido.'
                    }}
                </p>
            }
        </div>
    `,
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NfExploreComponent {
    private readonly router = inject(Router);
    private readonly route = inject(ActivatedRoute);
    protected readonly catalog = injectNfCatalog([]);
    protected readonly page = PAGE;
    protected readonly types: { key: ExploreType; label: string }[] = [
        { key: 'all', label: 'Todo' },
        { key: 'movie', label: 'Películas' },
        { key: 'series', label: 'Series' },
    ];

    private readonly params = toSignal(this.route.queryParamMap, {
        requireSync: true,
    });
    protected readonly type = computed<ExploreType>(() => {
        const t = this.params().get('type');
        return t === 'movie' || t === 'series' ? t : 'all';
    });
    protected readonly sort = computed<ExploreSort>(() => {
        const s = this.params().get('sort');
        return s === 'rating' || s === 'az' ? s : 'recent';
    });
    protected readonly tag = computed(() =>
        nfFindTag(this.params().get('platform') ?? this.params().get('genre'))
    );
    protected readonly category = computed(() => {
        const id = this.params().get('category');
        if (!id) return null;
        const list =
            this.type() === 'series'
                ? this.catalog.seriesCategories()
                : this.catalog.movieCategories();
        return list.find((c) => c.id === id) ?? { id, name: 'Categoría' };
    });
    protected readonly filter = linkedSignal(
        () => this.params().get('q') ?? ''
    );
    protected readonly limit = signal(PAGE);

    protected readonly heading = computed(() => {
        const label = this.category()?.name ?? this.tag()?.label;
        if (label) return label;
        const q = this.params().get('q');
        if (q) return `Resultados para "${q}"`;
        return this.type() === 'series'
            ? 'Series'
            : this.type() === 'movie'
              ? 'Películas'
              : 'Explorar';
    });
    protected readonly subtitle = computed(() =>
        this.sort() === 'rating'
            ? 'Las mejor valoradas'
            : this.sort() === 'az'
              ? 'Por orden alfabético'
              : 'Lo más reciente primero'
    );
    protected readonly accent = computed(() => {
        const color = this.tag()?.color;
        return color ? color + '66' : null;
    });

    protected readonly results = computed<NfItem[]>(() => {
        const type = this.type();
        let items: NfItem[] = [
            ...(type !== 'series' ? this.catalog.movies() : []),
            ...(type !== 'movie' ? this.catalog.series() : []),
        ];
        const category = this.category();
        const tag = this.tag();
        if (category) items = items.filter((i) => i.categoryId === category.id);
        else if (tag) {
            const categories = [
                ...(type !== 'series' ? this.catalog.movieCategories() : []),
                ...(type !== 'movie' ? this.catalog.seriesCategories() : []),
            ];
            items = nfTagItems(items, categories, tag);
        }
        const q = nfNorm(this.filter().trim());
        if (q) items = items.filter((i) => nfNorm(i.title).includes(q));
        switch (this.sort()) {
            case 'rating':
                return topRated(items);
            case 'az':
                return [...items].sort((a, b) =>
                    a.title.localeCompare(b.title, 'es')
                );
            default:
                return newestFirst(items);
        }
    });
    protected readonly shown = computed(() =>
        this.results().slice(0, this.limit())
    );

    protected link(item: NfItem): string[] {
        return nfLink(this.catalog.playlistId(), item);
    }

    protected set(change: Record<string, string>): void {
        this.limit.set(PAGE);
        void this.router.navigate([], {
            relativeTo: this.route,
            queryParams: change,
            queryParamsHandling: 'merge',
        });
    }
}
