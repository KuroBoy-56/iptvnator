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
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { NfCardComponent } from './nf-card.component';
import { injectNfCatalog } from './nf-catalog';
import { UiText } from '@iptvnator/shared/interfaces';
import { PanelBrandingService } from '@iptvnator/services';
import { NfHeroService, nfCssUrl } from './nf-hero.service';
import { nfFindTag, nfNorm, nfTagItems, nfTitleNorm } from './nf-filters';
import { NfItem, nfLink, newestFirst, topRated } from './nf-item';
import { NfNearEndDirective } from './nf-near-end.directive';
import { NfTitleSearchComponent } from './nf-title-search.component';

type ExploreType = 'all' | 'movie' | 'series';
type ExploreSort = 'recent' | 'rating' | 'az';

const PAGE = 120;
/** Un solo Collator: localeCompare(…, 'es') crea uno por comparación y congela A–Z con catálogos grandes. */
const TITLE_COLLATOR = new Intl.Collator('es');

/** "Ver todo", platforms, genres and categories as a poster grid (web player browse.php). */
@Component({
    selector: 'app-nf-explore',
    standalone: true,
    imports: [
        NfCardComponent,
        NfNearEndDirective,
        NfTitleSearchComponent,
        RouterLink,
        TranslatePipe,
    ],
    template: `
        <div class="nf-page">
            <header class="nf-browse-head" [style.--accent]="accent()">
                @if (backdrop()) {
                    <div class="nf-browse-bg" [style.background-image]="backdrop()"></div>
                }
                <h1>
                    @if (tag()?.img; as img) {
                        <img [src]="img" alt="" />
                    }
                    {{ headingText() }}
                </h1>
                <p>{{ subtitle() | translate }}</p>
                @if (platform()) {
                    <app-nf-title-search
                        [label]="headingText()"
                        [(value)]="filter"
                    />
                }
            </header>

            <div class="nf-filterbar">
                <div class="row1">
                    @if (!category()) {
                        <div
                            class="nf-seg"
                            role="group"
                            [attr.aria-label]="'MPX.NF.TYPE' | translate"
                        >
                            @for (t of types; track t.key) {
                                <button
                                    type="button"
                                    [class.active]="type() === t.key"
                                    (click)="set({ type: t.key })"
                                >
                                    {{ t.label | translate }}
                                </button>
                            }
                        </div>
                    }
                    <select
                        class="nf-select"
                        [attr.aria-label]="'MPX.NF.SORT' | translate"
                        [value]="sort()"
                        (change)="set({ sort: $any($event.target).value })"
                    >
                        <option value="recent">
                            {{ 'MPX.NF.RECENTLY_ADDED' | translate }}
                        </option>
                        <option value="rating">
                            {{ 'MPX.NF.TOP_RATED' | translate }}
                        </option>
                        <option value="az">A – Z</option>
                    </select>
                    @if (!platform()) {
                        <input
                            class="nf-input"
                            type="search"
                            [placeholder]="'MPX.NF.FILTER_TITLE' | translate"
                            [value]="filter()"
                            (input)="filter.set($any($event.target).value)"
                        />
                    }
                    <span class="nf-count">{{
                        'MPX.NF.TITLES_COUNT'
                            | translate: { count: results().length }
                    }}</span>
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
                                {{ 'MPX.COMMON.LOADING_MORE' | translate }}
                            </div>
                        }
                    }
                } @else {
                    <p class="nf-empty">
                        {{ 'MPX.NF.NO_RESULTS' | translate }}
                    </p>
                }
            } @else {
                <p class="nf-grid-status">
                    {{
                        (catalog.loading()
                            ? 'MPX.NF.LOADING_CATALOG'
                            : 'MPX.NF.NO_CONTENT') | translate
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
    private readonly translate = inject(TranslateService);
    private readonly branding = inject(PanelBrandingService);
    private readonly lastBackdrop = inject(NfHeroService).lastBackdrop;
    /** El último banner queda de fondo al recorrer plataformas y géneros. */
    protected readonly backdrop = computed(() => {
        const url = this.lastBackdrop();
        return url ? nfCssUrl(url) : '';
    });
    protected readonly catalog = injectNfCatalog([]);
    protected readonly page = PAGE;
    protected readonly types: { key: ExploreType; label: string }[] = [
        { key: 'all', label: 'MPX.NF.ALL' },
        { key: 'movie', label: 'MPX.NAV.MOVIES' },
        { key: 'series', label: 'MPX.NAV.SERIES' },
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
    /** ?platform= solo cuenta si el distribuidor separa por plataformas. */
    private readonly platformKey = computed(() =>
        this.branding.platforms() ? this.params().get('platform') : null
    );
    protected readonly tag = computed(() =>
        nfFindTag(this.platformKey() ?? this.params().get('genre'))
    );
    /** Platform page (Netflix, Disney+…): the name filter is the top-right magnifier. */
    protected readonly platform = computed(
        () => !!this.platformKey() && !this.category()
    );
    protected readonly category = computed(() => {
        const id = this.params().get('category');
        if (!id) return null;
        const list =
            this.type() === 'series'
                ? this.catalog.seriesCategories()
                : this.catalog.movieCategories();
        return (
            list.find((c) => c.id === id) ?? {
                id,
                name: this.translate.instant('MPX.NF.CATEGORY'),
            }
        );
    });
    protected readonly filter = linkedSignal(
        () => this.params().get('q') ?? ''
    );
    protected readonly limit = signal(PAGE);

    /** Category names are shown as the server sends them; tags and the rest are translated. */
    protected readonly heading = computed<UiText & { raw?: string }>(() => {
        const category = this.category();
        if (category) return { key: '', raw: category.name };
        const label = this.tag()?.label;
        if (label) return { key: label };
        const q = this.params().get('q');
        if (q) return { key: 'MPX.NF.RESULTS_FOR', params: { q } };
        return {
            key:
                this.type() === 'series'
                    ? 'MPX.NAV.SERIES'
                    : this.type() === 'movie'
                      ? 'MPX.NAV.MOVIES'
                      : 'MPX.NAV.EXPLORE',
        };
    });
    private readonly lang = toSignal(this.translate.onLangChange, {
        initialValue: null,
    });
    protected readonly headingText = computed(() => {
        this.lang();
        const h = this.heading();
        return h.raw ?? this.translate.instant(h.key, h.params);
    });
    protected readonly subtitle = computed(() =>
        this.sort() === 'rating'
            ? 'MPX.NF.SORT_RATING'
            : this.sort() === 'az'
              ? 'MPX.NF.SORT_AZ'
              : 'MPX.NF.SORT_RECENT'
    );
    protected readonly accent = computed(() => {
        const color = this.tag()?.color;
        return color ? color + '66' : null;
    });

    /** Tipo, categoría/etiqueta y orden; el filtro por título va aparte (no reordena al teclear). */
    private readonly sorted = computed<NfItem[]>(() => {
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
        switch (this.sort()) {
            case 'rating':
                return topRated(items);
            case 'az':
                return [...items].sort((a, b) =>
                    TITLE_COLLATOR.compare(a.title, b.title)
                );
            default:
                return newestFirst(items);
        }
    });
    protected readonly results = computed<NfItem[]>(() => {
        const q = nfNorm(this.filter().trim());
        const items = this.sorted();
        return q ? items.filter((i) => nfTitleNorm(i).includes(q)) : items;
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
