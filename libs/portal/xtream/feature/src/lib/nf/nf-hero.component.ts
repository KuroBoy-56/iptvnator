import {
    ChangeDetectionStrategy,
    Component,
    DestroyRef,
    computed,
    effect,
    inject,
    input,
    signal,
} from '@angular/core';
import { MatIcon } from '@angular/material/icon';
import { RouterLink } from '@angular/router';
import { NfHeroSlide } from './nf-hero.service';
import { nfLink } from './nf-item';

const ROTATE_MS = 9000;

/** Rotating billboard at the top of Inicio, Películas and Series (web player look). */
@Component({
    selector: 'app-nf-hero',
    standalone: true,
    imports: [MatIcon, RouterLink],
    host: {
        class: 'nf-hero',
        '[class.loading]': 'slides() === null',
        '[class.none]': 'slides()?.length === 0',
    },
    template: `
        @for (
            slide of list();
            track slide.item.type + slide.item.id;
            let i = $index
        ) {
            <div
                class="nf-hero-bg"
                [class.on]="i === index()"
                [style.background-image]="bg(slide)"
            ></div>
        }
        @if (current(); as slide) {
            <div class="nf-hero-info">
                <div class="nf-hero-kicker">
                    <span class="n">N</span
                    >{{
                        kicker() ||
                            (slide.item.type === 'series'
                                ? 'Serie'
                                : 'Película')
                    }}
                </div>
                <h1 class="nf-hero-title">{{ slide.title }}</h1>
                <div class="nf-hero-meta">
                    @if (slide.rating) {
                        <span class="nf-match">★ {{ slide.rating }}</span>
                    }
                    @if (slide.year) {
                        <span>{{ slide.year }}</span>
                    }
                    @if (slide.genre) {
                        <span class="nf-badge">{{ slide.genre }}</span>
                    }
                </div>
                @if (slide.description) {
                    <p class="nf-hero-desc">{{ slide.description }}</p>
                }
                <div class="nf-hero-btns">
                    <a class="nf-btn nf-btn-white" [routerLink]="link(slide)">
                        <mat-icon>play_arrow</mat-icon>Reproducir
                    </a>
                    <a class="nf-btn nf-btn-gray" [routerLink]="link(slide)">
                        <mat-icon>info_outline</mat-icon>Más información
                    </a>
                </div>
            </div>
            @if (list().length > 1) {
                <div class="nf-hero-dots">
                    @for (slide of list(); track $index; let i = $index) {
                        <button
                            type="button"
                            [class.on]="i === index()"
                            [attr.aria-label]="'Destacado ' + (i + 1)"
                            (click)="show(i)"
                        ></button>
                    }
                </div>
            }
        }
    `,
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NfHeroComponent {
    /** null while loading; [] when there is nothing to feature. */
    readonly slides = input<NfHeroSlide[] | null>(null);
    readonly playlistId = input.required<string>();
    readonly kicker = input('');

    protected readonly index = signal(0);
    protected readonly list = computed(() => this.slides() ?? []);
    protected readonly current = computed(
        () => this.list()[this.index()] ?? null
    );
    private timer: ReturnType<typeof setInterval> | null = null;

    constructor() {
        effect(() => {
            const count = this.list().length;
            this.index.set(0);
            this.restart(count);
        });
        inject(DestroyRef).onDestroy(() => this.stop());
    }

    protected show(i: number): void {
        this.index.set(i);
        this.restart(this.list().length);
    }

    protected link(slide: NfHeroSlide): string[] {
        return nfLink(this.playlistId(), slide.item);
    }

    protected bg(slide: NfHeroSlide): string {
        return `url("${slide.backdrop.replace(/"/g, '%22')}")`;
    }

    private restart(count: number): void {
        this.stop();
        if (count < 2) return;
        this.timer = setInterval(
            () => this.index.update((i) => (i + 1) % count),
            ROTATE_MS
        );
    }

    private stop(): void {
        if (this.timer) clearInterval(this.timer);
        this.timer = null;
    }
}
