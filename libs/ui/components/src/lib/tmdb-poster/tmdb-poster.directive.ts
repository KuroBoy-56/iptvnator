import { AfterViewInit, Directive, effect, ElementRef, inject, input, untracked } from '@angular/core';
import { panelPosterSources, TmdbPosterService } from '@iptvnator/services';

const PLACEHOLDER_PATTERN = /default-poster\.png|blank-icon\./i;
const PLACEHOLDER = './assets/images/default-poster.png';

/**
 * Forces a cover on poster images: when the provider artwork is missing,
 * a placeholder or fails to load, the TMDB poster for the title is used.
 * Live channels keep their logos.
 *
 * <img [src]="poster" [appTmdbPoster]="title" tmdbType="series" />
 *
 * With `posterSrc` the directive owns the src and goes through the panel image cache first (as Roku, Vega and
 * Android): the panel copy, api/img.php, the original address and, if all fail, the TMDB search below.
 *
 * <img [posterSrc]="poster" [appTmdbPoster]="title" tmdbType="movie" [tmdbId]="tmdb" [posterYear]="year" />
 */
@Directive({
    selector: 'img[appTmdbPoster]',
    standalone: true,
    host: { '(error)': 'onError()' },
})
export class TmdbPosterDirective implements AfterViewInit {
    private readonly img = inject<ElementRef<HTMLImageElement>>(ElementRef).nativeElement;
    private readonly posters = inject(TmdbPosterService);
    private tried = false;
    private sources: string[] = [];
    private at = 0;

    /** Title used for the TMDB search */
    readonly appTmdbPoster = input<string | null | undefined>('');
    /** Content type: movie/vod or series/tv; live is ignored */
    readonly tmdbType = input<string | null | undefined>('movie');
    /** Provider poster: the directive sets the src itself (panel cache first). Leave unset to keep [src]. */
    readonly posterSrc = input<string | null | undefined>(undefined);
    /** TMDB id sent by the provider (one panel copy per title, whatever the IPTV server) */
    readonly tmdbId = input<string | number | null | undefined>('');
    /** Release year (helps the panel find the TMDB poster by title) */
    readonly posterYear = input<string | number | null | undefined>('');

    constructor() {
        effect(() => {
            const poster = this.posterSrc();
            if (poster === undefined) return;
            const type = (this.tmdbType() ?? '').toLowerCase();
            const title = this.appTmdbPoster() ?? '';
            const tm = String(this.tmdbId() ?? '');
            const year = String(this.posterYear() ?? '');
            untracked(() => this.start(poster ?? '', type, title, year, tm));
        });
    }

    ngAfterViewInit(): void {
        if (this.posterSrc() !== undefined) return;
        const src = this.img.getAttribute('src') ?? '';
        if (!src.trim() || PLACEHOLDER_PATTERN.test(src)) void this.replace();
    }

    onError(): void {
        if (this.posterSrc() !== undefined && this.at + 1 < this.sources.length) {
            this.at++;
            this.img.src = this.sources[this.at];
            return;
        }
        void this.replace();
    }

    private start(poster: string, type: string, title: string, year: string, tm: string): void {
        this.tried = false;
        this.at = 0;
        this.sources = panelPosterSources(type, PLACEHOLDER_PATTERN.test(poster) ? '' : poster.trim(), title, year, tm);
        this.img.src = this.sources[0] ?? PLACEHOLDER;
        if (!this.sources.length) void this.replace();
    }

    private async replace(): Promise<void> {
        const type = (this.tmdbType() ?? '').toLowerCase();
        if (this.tried || type === 'live' || type === 'radio') return;
        this.tried = true;
        // the panel's TMDB key may not have arrived yet (first start)
        if (!(await this.posters.whenKeyAvailable())) return;
        const url = await this.posters.find(
            this.appTmdbPoster(),
            type === 'series' || type === 'tv' ? 'tv' : 'movie'
        );
        if (url) {
            this.img.style.removeProperty('display');
            this.img.src = url;
        } else if (this.posterSrc() !== undefined && !PLACEHOLDER_PATTERN.test(this.img.src)) {
            // nothing loaded: the placeholder (the card shows the title over it)
            this.img.src = PLACEHOLDER;
        }
    }
}
