import {
    ChangeDetectionStrategy,
    Component,
    computed,
    inject,
    signal,
} from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { injectNfCatalog } from './nf-catalog';
import { NF_GENRES, nfAvailable } from './nf-filters';
import { NfHeroComponent } from './nf-hero.component';
import { newestFirst, NfItem, topRated } from './nf-item';
import { NfNearEndDirective } from './nf-near-end.directive';
import { NfRowComponent } from './nf-row.component';

interface CategoryRow {
    id: string;
    name: string;
    items: NfItem[];
}

const ROWS_STEP = 10;

/** "Películas" / "Series": the web player's on-demand page (includes/ondemand.php). */
@Component({
    selector: 'app-nf-browse',
    standalone: true,
    imports: [
        NfHeroComponent,
        NfNearEndDirective,
        NfRowComponent,
        RouterLink,
        TranslatePipe,
    ],
    template: `
        <div class="nf-page">
            <app-nf-hero
                [slides]="catalog.heroSlides()"
                [playlistId]="catalog.playlistId()"
                [kicker]="(isSeries ? 'MPX.NF.SERIES_ONE' : 'MPX.NF.MOVIE_ONE') | translate"
            />

            <div class="nf-titlebar">
                <h1 class="nf-page-title">{{ label | translate }}</h1>
                <select
                    class="nf-select"
                    [attr.aria-label]="'MPX.NF.CATEGORIES' | translate"
                    (change)="openCategory($any($event.target).value)"
                >
                    <option value="">{{ 'MPX.NF.CATEGORIES' | translate }}</option>
                    @for (c of categories(); track c.id) {
                        <option [value]="c.id">{{ c.name }}</option>
                    }
                </select>
            </div>

            @if (genres().length) {
                <nav class="nf-chips" [attr.aria-label]="'MPX.NF.GENRES' | translate">
                    @for (g of genres(); track g.key) {
                        <a
                            class="nf-chip"
                            [routerLink]="explore"
                            [queryParams]="{ type: type, genre: g.key }"
                            >{{ g.label | translate }}</a
                        >
                    }
                </nav>
            }

            <div class="nf-rows">
                @if (catalog.ready()) {
                    <app-nf-row
                        [title]="'MPX.NF.RECENTLY_ADDED' | translate"
                        [items]="recent()"
                        [playlistId]="catalog.playlistId()"
                        [more]="explore"
                        [moreQuery]="{ type: type, sort: 'recent' }"
                    />
                    <app-nf-row
                        [title]="
                            (isSeries ? 'MPX.NF.TOP10_SERIES' : 'MPX.NF.TOP10_MOVIES')
                                | translate
                        "
                        [items]="top()"
                        [playlistId]="catalog.playlistId()"
                        [more]="explore"
                        [moreQuery]="{ type: type, sort: 'rating' }"
                        variant="top"
                    />
                    @for (row of shownRows(); track row.id) {
                        <app-nf-row
                            [title]="row.name"
                            [items]="row.items"
                            [playlistId]="catalog.playlistId()"
                            [more]="explore"
                            [moreQuery]="{ type: type, category: row.id }"
                        />
                    }
                    @if (shownRows().length < categoryRows().length) {
                        @for (step of [shownRows().length]; track step) {
                            <div
                                class="nf-grid-status"
                                (nfNearEnd)="showMore()"
                            >
                                {{ 'MPX.COMMON.LOADING_MORE' | translate }}
                            </div>
                        }
                    }
                } @else if (catalog.loading()) {
                    <app-nf-row
                        [title]="'MPX.NF.RECENTLY_ADDED' | translate"
                        [items]="null"
                        [playlistId]="catalog.playlistId()"
                    />
                    <app-nf-row
                        title="Top 10"
                        [items]="null"
                        [playlistId]="catalog.playlistId()"
                    />
                } @else {
                    <p class="nf-empty">
                        {{
                            (isSeries ? 'MPX.NF.NO_SERIES' : 'MPX.NF.NO_MOVIES')
                                | translate
                        }}
                    </p>
                }
            </div>
        </div>
    `,
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NfBrowseComponent {
    private readonly router = inject(Router);
    protected readonly isSeries =
        inject(ActivatedRoute).snapshot.data['nfType'] === 'series';
    protected readonly type = this.isSeries ? 'series' : 'movie';
    protected readonly label = this.isSeries ? 'MPX.NAV.SERIES' : 'MPX.NAV.MOVIES';
    protected readonly catalog = injectNfCatalog([this.type]);

    private readonly items = computed(() =>
        this.isSeries ? this.catalog.series() : this.catalog.movies()
    );
    protected readonly categories = computed(() =>
        this.isSeries
            ? this.catalog.seriesCategories()
            : this.catalog.movieCategories()
    );
    protected readonly genres = computed(() =>
        nfAvailable(NF_GENRES, this.categories())
    );
    protected readonly recent = computed(() => newestFirst(this.items()));
    protected readonly top = computed(() =>
        topRated(this.recent().slice(0, 300))
    );

    protected readonly categoryRows = computed<CategoryRow[]>(() => {
        const byCategory = this.catalog.byCategory(this.items());
        return this.categories()
            .map((c) => ({
                ...c,
                items: newestFirst(byCategory.get(c.id) ?? []).slice(0, 30),
            }))
            .filter((row) => row.items.length > 0);
    });
    private readonly rowCount = signal(ROWS_STEP);
    protected readonly shownRows = computed(() =>
        this.categoryRows().slice(0, this.rowCount())
    );

    protected get explore(): string[] {
        return ['/workspace', 'xtreams', this.catalog.playlistId(), 'explore'];
    }

    protected showMore(): void {
        this.rowCount.update((n) => n + ROWS_STEP);
    }

    protected openCategory(id: string): void {
        if (id)
            void this.router.navigate(this.explore, {
                queryParams: { type: this.type, category: id },
            });
    }
}
