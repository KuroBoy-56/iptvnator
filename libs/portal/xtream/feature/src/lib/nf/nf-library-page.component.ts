import {
    ChangeDetectionStrategy,
    Component,
    computed,
    inject,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { map } from 'rxjs';
import { NfCardComponent } from './nf-card.component';
import { injectNfCatalog } from './nf-catalog';
import { NfItem, nfLink } from './nf-item';

export type NfLibraryList = 'continue' | 'myList';

/** Route data key that picks the list ("Ver todo" of the Inicio panel rows). */
export const NF_LIBRARY_LIST = 'nfList';

/**
 * "Ver todo" for Continuar viendo and Mi lista: the whole panel list as a
 * poster grid, in the same newest-first order as the Inicio row.
 */
@Component({
    selector: 'app-nf-library-page',
    standalone: true,
    imports: [NfCardComponent, RouterLink, TranslatePipe],
    template: `
        <div class="nf-page">
            <header class="nf-browse-head">
                <h1>{{ heading() | translate }}</h1>
                <p>
                    @if (items()?.length; as count) {
                        {{ 'MPX.NF.TITLES_COUNT' | translate: { count } }} ·
                    }
                    {{ 'MPX.NF.SORT_RECENT' | translate }}
                </p>
            </header>
            @if (items(); as list) {
                @if (list.length) {
                    <div class="nf-grid">
                        @for (item of list; track item.type + item.id) {
                            <a
                                nfCard
                                [item]="item"
                                [routerLink]="link(item)"
                            ></a>
                        }
                    </div>
                } @else {
                    <p class="nf-empty">{{ empty() | translate }}</p>
                }
            } @else {
                <p class="nf-grid-status">
                    {{ 'MPX.COMMON.LOADING' | translate }}
                </p>
            }
        </div>
    `,
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NfLibraryPageComponent {
    private readonly route = inject(ActivatedRoute);
    protected readonly catalog = injectNfCatalog([], true);

    protected readonly list = toSignal(
        this.route.data.pipe(
            map(
                (d): NfLibraryList =>
                    d[NF_LIBRARY_LIST] === 'myList' ? 'myList' : 'continue'
            )
        ),
        { initialValue: 'continue' as NfLibraryList }
    );

    protected readonly heading = computed(() =>
        this.list() === 'myList' ? 'MPX.NF.MY_LIST' : 'MPX.NF.CONTINUE_WATCHING'
    );
    protected readonly empty = computed(() =>
        this.list() === 'myList'
            ? 'MPX.NF.EMPTY_MY_LIST'
            : 'MPX.NF.EMPTY_CONTINUE'
    );

    protected readonly items = computed<NfItem[] | null>(() => {
        const lib = this.catalog.library();
        if (!lib)
            return this.catalog.ready() || this.catalog.loading() ? null : [];
        return this.list() === 'myList' ? lib.myList : lib.continueWatching;
    });

    protected link(item: NfItem): string[] {
        return nfLink(this.catalog.playlistId(), item);
    }
}
