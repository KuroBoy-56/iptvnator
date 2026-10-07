import { AfterViewInit, Directive, ElementRef, inject, input } from '@angular/core';
import { TmdbPosterService } from '@iptvnator/services';

const PLACEHOLDER_PATTERN = /default-poster\.png|blank-icon\./i;

/**
 * Forces a cover on poster images: when the provider artwork is missing,
 * a placeholder or fails to load, the TMDB poster for the title is used.
 * Live channels keep their logos.
 *
 * <img [src]="poster" [appTmdbPoster]="title" tmdbType="series" />
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

    /** Title used for the TMDB search */
    readonly appTmdbPoster = input<string | null | undefined>('');
    /** Content type: movie/vod or series/tv; live is ignored */
    readonly tmdbType = input<string | null | undefined>('movie');

    ngAfterViewInit(): void {
        const src = this.img.getAttribute('src') ?? '';
        if (!src.trim() || PLACEHOLDER_PATTERN.test(src)) void this.replace();
    }

    onError(): void {
        void this.replace();
    }

    private async replace(): Promise<void> {
        const type = (this.tmdbType() ?? '').toLowerCase();
        if (this.tried || type === 'live' || type === 'radio') return;
        this.tried = true;
        const url = await this.posters.find(
            this.appTmdbPoster(),
            type === 'series' || type === 'tv' ? 'tv' : 'movie'
        );
        if (url) {
            this.img.style.removeProperty('display');
            this.img.src = url;
        }
    }
}
