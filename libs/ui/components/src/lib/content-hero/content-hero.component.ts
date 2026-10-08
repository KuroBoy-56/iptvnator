import {
    Component,
    DestroyRef,
    computed,
    effect,
    inject,
    Injector,
    input,
    linkedSignal,
    output,
    signal,
    untracked,
    viewChild,
    ElementRef,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { TranslateModule } from '@ngx-translate/core';
import { NgxSkeletonLoaderComponent } from 'ngx-skeleton-loader';
import { TmdbPosterService } from '@iptvnator/services';

@Component({
    selector: 'app-content-hero',
    standalone: true,
    imports: [
        MatIconModule,
        MatButtonModule,
        NgxSkeletonLoaderComponent,
        TranslateModule,
    ],
    templateUrl: './content-hero.component.html',
    styleUrls: ['./content-hero.component.scss'],
})
export class ContentHeroComponent {
    private readonly destroyRef = inject(DestroyRef);

    readonly title = input<string>();
    readonly description = input<string>();
    readonly posterUrl = input<string>();
    readonly backdropUrl = input<string>();
    readonly isLoading = input(false);
    readonly errorMessage = input<string>();
    /** movie | series — used for the TMDB cover fallback. */
    readonly mediaType = input<string>('movie');

    readonly backClicked = output<void>();
    /** The provider cover failed to load (reset when the cover changes). */
    readonly posterError = linkedSignal({ source: this.posterUrl, computation: () => false });
    /** TMDB cover (panel key) used when the provider has none or it is broken. */
    readonly tmdbPoster = signal<string | null>(null);
    readonly displayPoster = computed(() => {
        const own = this.posterUrl();
        return own && !this.posterError() ? own : this.tmdbPoster();
    });
    private readonly injector = inject(Injector);

    readonly descriptionEl = viewChild<ElementRef<HTMLElement>>('descriptionEl');
    readonly isDescriptionExpanded = signal(false);
    readonly hasDescriptionOverflow = signal(false);

    private resizeObserver?: ResizeObserver;

    constructor() {
        effect(() => {
            // Re-measure whenever description content or the element changes.
            this.description();
            const el = this.descriptionEl()?.nativeElement;
            if (!el) return;

            // untracked: measureOverflow reads isDescriptionExpanded();
            // tracking it would re-run this effect (and rebuild the
            // ResizeObserver) on every expand/collapse click.
            untracked(() => {
                this.measureOverflow(el);
                this.observeOverflow(el);
            });
        });

        effect(() => {
            const title = this.title()?.trim();
            const needsCover = !this.isLoading() && (!this.posterUrl() || this.posterError());
            const type = (this.mediaType() ?? '').toLowerCase();
            untracked(() => this.tmdbPoster.set(null));
            if (!title || !needsCover || type === 'live') return;
            untracked(() => void this.loadTmdbPoster(title, type === 'series' || type === 'tv' ? 'tv' : 'movie'));
        });

        this.destroyRef.onDestroy(() => this.resizeObserver?.disconnect());
    }

    onPosterError(): void {
        if (this.posterUrl() && !this.posterError()) this.posterError.set(true);
        else this.tmdbPoster.set(null);
    }

    private async loadTmdbPoster(title: string, type: 'movie' | 'tv'): Promise<void> {
        try {
            const posters = this.injector.get(TmdbPosterService);
            if (!(await posters.whenKeyAvailable())) return;
            const url = await posters.find(title, type);
            if (url && this.title()?.trim() === title) this.tmdbPoster.set(url);
        } catch {
            // TMDB unavailable: keep the placeholder
        }
    }

    readonly formattedTitle = computed(() => {
        const t = this.title();
        if (!t) return '';
        // Replace underscores with spaces for cleaner UX on slug/filename style titles
        return t.replace(/_/g, ' ').replace(/\s+/g, ' ').trim();
    });

    private calculateHue(text: string): number {
        if (!text) return 0;
        let hash = 0;
        for (let i = 0; i < text.length; i++) {
            hash = text.charCodeAt(i) + ((hash << 5) - hash);
            hash = hash & hash;
        }
        return Math.abs(hash) % 360;
    }

    readonly fallbackPosterBackground = computed(() => {
        const hue = this.calculateHue(this.title() || 'placeholder');
        const h2 = (hue + 40) % 360;
        return `linear-gradient(135deg, hsl(${hue}, 40%, 25%) 0%, hsl(${h2}, 50%, 15%) 100%)`;
    });

    readonly fallbackBackdropBackground = computed(() => {
        const hue = this.calculateHue(this.title() || 'placeholder');
        const h2 = (hue + 60) % 360;
        return `linear-gradient(135deg, hsl(${hue}, 50%, 15%) 0%, hsl(${h2}, 80%, 5%) 100%)`;
    });

    onBack(): void {
        this.backClicked.emit();
    }

    toggleDescription(): void {
        this.isDescriptionExpanded.update((v) => !v);
    }

    private measureOverflow(el: HTMLElement): void {
        // Measure only in the clamped state; if already expanded, clamped overflow
        // is implied when the element previously overflowed.
        if (this.isDescriptionExpanded()) return;
        this.hasDescriptionOverflow.set(el.scrollHeight > el.clientHeight + 1);
    }

    private observeOverflow(el: HTMLElement): void {
        this.resizeObserver?.disconnect();
        if (typeof ResizeObserver === 'undefined') {
            this.measureOverflow(el);
            return;
        }
        this.resizeObserver = new ResizeObserver(() => this.measureOverflow(el));
        this.resizeObserver.observe(el);
    }
}
