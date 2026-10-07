import {
    ChangeDetectionStrategy,
    Component,
    ElementRef,
    computed,
    input,
    signal,
    viewChild,
} from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { MatIcon } from '@angular/material/icon';
import { RouterLink } from '@angular/router';
import { NfCardComponent } from './nf-card.component';
import { NfItem, nfLink } from './nf-item';

/** Horizontal row of posters with arrows, as in the web player ("Ver todo ›"). */
@Component({
    selector: 'app-nf-row',
    standalone: true,
    imports: [MatIcon, NfCardComponent, NgTemplateOutlet, RouterLink],
    host: { class: 'nf-row', '[class.nf-top]': "variant() === 'top'" },
    template: `
        <div class="nf-row-head">
            <h2 class="nf-row-title">{{ title() }}</h2>
            @if (more(); as link) {
                <a
                    class="nf-row-more"
                    [routerLink]="link"
                    [queryParams]="moreQuery()"
                    >Ver todo ›</a
                >
            }
        </div>
        <div class="nf-row-viewport">
            @if (canGoBack()) {
                <button
                    class="nf-arrow l"
                    type="button"
                    aria-label="Anterior"
                    (click)="scroll(-1)"
                >
                    <mat-icon>chevron_left</mat-icon>
                </button>
            }
            <div class="nf-slider" #slider (scroll)="onScroll()">
                @if (loading()) {
                    @for (s of skeletons; track s) {
                        <div class="nf-skel"></div>
                    }
                } @else {
                    @for (
                        item of shown();
                        track item.type + item.id;
                        let i = $index
                    ) {
                        @if (variant() === 'top') {
                            <div class="nf-topitem" [class.ten]="i === 9">
                                <span class="num">{{ i + 1 }}</span>
                                <ng-container
                                    *ngTemplateOutlet="
                                        card;
                                        context: { $implicit: item }
                                    "
                                />
                            </div>
                        } @else {
                            <ng-container
                                *ngTemplateOutlet="
                                    card;
                                    context: { $implicit: item }
                                "
                            />
                        }
                    }
                }
            </div>
            <button
                class="nf-arrow r"
                type="button"
                aria-label="Siguiente"
                (click)="scroll(1)"
            >
                <mat-icon>chevron_right</mat-icon>
            </button>
        </div>

        <ng-template #card let-item>
            <a nfCard [item]="item" [routerLink]="link(item)"></a>
        </ng-template>
    `,
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NfRowComponent {
    readonly title = input.required<string>();
    readonly items = input<NfItem[] | null>(null);
    readonly playlistId = input.required<string>();
    readonly more = input<string[] | null>(null);
    readonly moreQuery = input<Record<string, string> | null>(null);
    readonly variant = input<'' | 'top'>('');
    readonly limit = input(30);

    private readonly slider = viewChild<ElementRef<HTMLElement>>('slider');
    protected readonly canGoBack = signal(false);
    protected readonly skeletons = [0, 1, 2, 3, 4, 5, 6, 7];
    protected readonly loading = computed(() => this.items() === null);
    protected readonly shown = computed(() =>
        (this.items() ?? []).slice(
            0,
            this.variant() === 'top' ? 10 : this.limit()
        )
    );

    protected link(item: NfItem): string[] {
        return nfLink(this.playlistId(), item);
    }

    protected scroll(direction: 1 | -1): void {
        const el = this.slider()?.nativeElement;
        if (!el) return;
        el.scrollBy({
            left: direction * el.clientWidth * 0.9,
            behavior: 'smooth',
        });
    }

    protected onScroll(): void {
        const el = this.slider()?.nativeElement;
        this.canGoBack.set(!!el && el.scrollLeft > 4);
    }
}
