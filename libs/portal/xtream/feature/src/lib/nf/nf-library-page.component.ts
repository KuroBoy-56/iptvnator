import {
    ChangeDetectionStrategy,
    Component,
    computed,
    inject,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
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
    imports: [NfCardComponent, RouterLink],
    template: `
        <div class="nf-page">
            <header class="nf-browse-head">
                <h1>{{ heading() }}</h1>
                <p>
                    @if (items()?.length; as count) {
                        {{ count }} títulos ·
                    }
                    Lo más reciente primero
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
                    <p class="nf-empty">{{ empty() }}</p>
                }
            } @else {
                <p class="nf-grid-status">Cargando…</p>
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
        this.list() === 'myList' ? 'Mi lista' : 'Continuar viendo'
    );
    protected readonly empty = computed(() =>
        this.list() === 'myList'
            ? 'Aún no agregaste títulos a Mi lista.'
            : 'No tienes nada pendiente por ver.'
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
