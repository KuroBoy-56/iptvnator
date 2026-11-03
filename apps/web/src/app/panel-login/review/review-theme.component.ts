import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { ReviewVideo } from '../panel-login.service';
import { ReviewThemeService } from './review-theme.service';

type Tab = 'movies' | 'series' | 'settings';

/**
 * Tema de prueba (como Vega, Android, LG, Samsung e iOS): Películas a la izquierda, Series al lado y Ajustes (solo
 * «Cerrar sesión»), con los videos de la carpeta player del panel en un reproductor sencillo. Sin sesión, progreso,
 * caché ni registro en el panel.
 */
@Component({
    selector: 'app-review-theme',
    standalone: true,
    imports: [TranslatePipe],
    changeDetection: ChangeDetectionStrategy.OnPush,
    template: `
        <div class="rv">
            <nav class="rv-tabs">
                <button type="button" [class.on]="tab() === 'movies'" (click)="pick('movies')">{{ 'MPX.REVIEW.MOVIES' | translate }}</button>
                <button type="button" [class.on]="tab() === 'series'" (click)="pick('series')">{{ 'MPX.REVIEW.SERIES' | translate }}</button>
                <button type="button" [class.on]="tab() === 'settings'" (click)="pick('settings')">{{ 'MPX.REVIEW.SETTINGS' | translate }}</button>
            </nav>
            @if (tab() === 'settings') {
                <section class="rv-settings">
                    <button type="button" class="nf-btn-red" (click)="logout()">{{ 'MPX.REVIEW.LOGOUT' | translate }}</button>
                </section>
            } @else if (playing(); as video) {
                <section class="rv-player">
                    <div class="rv-player-head">
                        <button type="button" class="nf-btn-dark" (click)="playing.set(null)">{{ 'MPX.REVIEW.BACK' | translate }}</button>
                        <h2>{{ video.name }}</h2>
                    </div>
                    <video [src]="video.url" controls autoplay playsinline (error)="failed.set(true)"></video>
                    @if (failed()) {
                        <p class="rv-error">{{ 'MPX.REVIEW.ERROR' | translate }}</p>
                    }
                </section>
            } @else {
                <section class="rv-grid">
                    @for (v of list(); track v.url) {
                        <button type="button" class="rv-card" (click)="play(v)">
                            <span class="rv-play" aria-hidden="true">▶</span>
                            <span class="rv-name">{{ v.name }}</span>
                        </button>
                    } @empty {
                        <p class="rv-empty">{{ 'MPX.REVIEW.EMPTY' | translate }}</p>
                    }
                </section>
            }
        </div>
    `,
    styles: `
        .rv { min-height: 100vh; background: #141414; color: #fff; padding: 24px 4vw; box-sizing: border-box; }
        .rv-tabs { display: flex; gap: 8px; margin-bottom: 24px; }
        .rv-tabs button { background: transparent; color: #ccc; border: 0; border-bottom: 3px solid transparent; font-size: 18px; font-weight: 600; padding: 8px 14px; cursor: pointer; }
        .rv-tabs button.on, .rv-tabs button:hover, .rv-tabs button:focus-visible { color: #fff; border-color: var(--nf-accent, #e50914); outline: none; }
        .rv-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 14px; }
        .rv-card { display: flex; align-items: center; gap: 12px; min-height: 84px; padding: 14px; border-radius: 8px; border: 1px solid rgba(255, 255, 255, 0.12); background: #1f1f1f; color: #fff; text-align: left; cursor: pointer; font-size: 15px; }
        .rv-card:hover, .rv-card:focus-visible { border-color: var(--nf-focus, #fff); outline: none; transform: scale(1.02); }
        .rv-play { color: var(--nf-accent, #e50914); font-size: 22px; }
        .rv-player-head { display: flex; align-items: center; gap: 16px; margin-bottom: 12px; }
        .rv-player-head h2 { margin: 0; font-size: 20px; }
        video { width: 100%; max-height: 78vh; background: #000; border-radius: 6px; }
        .rv-error, .rv-empty { opacity: 0.8; }
        .rv-settings { padding: 12px 0; }
    `,
})
export class ReviewThemeComponent {
    private readonly review = inject(ReviewThemeService);
    private readonly router = inject(Router);
    protected readonly tab = signal<Tab>('movies');
    protected readonly playing = signal<ReviewVideo | null>(null);
    protected readonly failed = signal(false);
    protected readonly list = computed(() => {
        const c = this.review.content();
        return this.tab() === 'series' ? (c?.series ?? []) : (c?.movies ?? []);
    });

    pick(tab: Tab): void {
        this.tab.set(tab);
        this.playing.set(null);
    }

    play(video: ReviewVideo): void {
        this.failed.set(false);
        this.playing.set(video);
    }

    async logout(): Promise<void> {
        this.review.close();
        await this.router.navigate(['/login']);
    }
}
