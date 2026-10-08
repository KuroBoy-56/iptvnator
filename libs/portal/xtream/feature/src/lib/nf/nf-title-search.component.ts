import {
    ChangeDetectionStrategy,
    Component,
    ElementRef,
    afterNextRender,
    inject,
    Injector,
    input,
    linkedSignal,
    model,
    viewChild,
} from '@angular/core';

/**
 * Top-right magnifier of a platform page (web player browse.php): the button
 * expands a text field that filters the shown titles by name as you type.
 */
@Component({
    selector: 'app-nf-title-search',
    standalone: true,
    template: `
        <div class="nf-psearch" [class.open]="open()">
            <button
                type="button"
                class="nf-psearch-btn"
                aria-label="Buscar por nombre"
                title="Buscar por nombre"
                (click)="toggle()"
            >
                <svg
                    viewBox="0 0 24 24"
                    width="22"
                    height="22"
                    aria-hidden="true"
                >
                    <circle
                        cx="10.5"
                        cy="10.5"
                        r="6.5"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="2.4"
                    />
                    <path
                        d="M15.5 15.5 21 21"
                        stroke="currentColor"
                        stroke-width="2.4"
                        stroke-linecap="round"
                    />
                </svg>
            </button>
            @if (open()) {
                <input
                    #field
                    class="nf-psearch-in"
                    type="search"
                    autocomplete="off"
                    aria-label="Filtrar por nombre"
                    [placeholder]="
                        label() ? 'Buscar en ' + label() + '…' : 'Buscar…'
                    "
                    [value]="value()"
                    (input)="value.set($any($event.target).value)"
                    (keydown.escape)="close()"
                />
            }
        </div>
    `,
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NfTitleSearchComponent {
    private readonly injector = inject(Injector);

    /** Current filter text (two-way bound). */
    readonly value = model('');
    /** Platform name shown in the placeholder. */
    readonly label = input('');

    /** Opens with a preset value and stays open while typing (even if emptied). */
    protected readonly open = linkedSignal<string, boolean>({
        source: this.value,
        computation: (v, prev) => (prev?.value ?? false) || v !== '',
    });
    private readonly field = viewChild<ElementRef<HTMLInputElement>>('field');

    protected toggle(): void {
        if (!this.open()) {
            this.open.set(true);
            afterNextRender(() => this.field()?.nativeElement.focus(), {
                injector: this.injector,
            });
            return;
        }
        this.close();
    }

    protected close(): void {
        this.open.set(false);
        this.value.set('');
    }
}
