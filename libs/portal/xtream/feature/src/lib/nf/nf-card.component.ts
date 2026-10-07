import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { TmdbPosterDirective } from '@iptvnator/ui/components';
import { NfItem } from './nf-item';

/** Poster card used by rows and grids: `<a nfCard [item]="..." [routerLink]="...">`. */
@Component({
    selector: 'a[nfCard]',
    standalone: true,
    imports: [TmdbPosterDirective],
    host: {
        class: 'nf-card',
        '[class.has-pb]': 'item().progress != null',
        '[class.noimg]': '!item().poster',
        '[attr.title]': 'item().title',
    },
    template: `
        <img
            [src]="item().poster || './assets/images/default-poster.png'"
            [appTmdbPoster]="item().title"
            [tmdbType]="item().type"
            alt=""
            loading="lazy"
            decoding="async"
            (load)="$any($event.target).classList.add('ok')"
        />
        @if (item().rating) {
            <span class="rt">★ {{ item().rating }}</span>
        }
        <span class="nm">{{ item().title }}</span>
        @if (item().progress != null) {
            <span class="pb"><i [style.width.%]="item().progress"></i></span>
        }
    `,
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NfCardComponent {
    readonly item = input.required<NfItem>();
}
