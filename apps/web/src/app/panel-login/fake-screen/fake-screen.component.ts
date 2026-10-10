import { ChangeDetectionStrategy, Component, computed, DestroyRef, inject, input, output, signal } from '@angular/core';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { calculate, PanelFakeScreen } from './fake-screen.util';

const KEYS = ['C', '(', ')', '÷', '7', '8', '9', '×', '4', '5', '6', '-', '1', '2', '3', '+', '0', '.', '='];

/**
 * Full-screen fake screen for new devices (panel «Pantalla Falsa»): a working calculator,
 * an image carousel, an image, a looping video or a web page (sandboxed iframe: it can
 * never reach the app). The panel's code + "=" opens the login. The device id is shown
 * small at the bottom so the distributor can register it.
 */
@Component({
    selector: 'app-fake-screen',
    standalone: true,
    changeDetection: ChangeDetectionStrategy.OnPush,
    template: `
        <div class="fs-root">
            @switch (screen().type) {
                @case ('carrusel') {
                    <img class="fs-media" [src]="screen().images[index()]" alt="" />
                }
                @case ('image') {
                    <img class="fs-media" [src]="screen().url" alt="" />
                }
                @case ('video') {
                    <video class="fs-media" [src]="screen().url" autoplay loop muted playsinline></video>
                }
                @case ('web') {
                    <iframe class="fs-media fs-web" [src]="webUrl()" sandbox="allow-scripts allow-forms" referrerpolicy="no-referrer" title="web"></iframe>
                }
                @default {
                    <div class="fs-calc">
                        <div class="fs-display">{{ display() || '0' }}</div>
                        <div class="fs-keys">
                            @for (k of keys; track k) {
                                <button type="button" class="fs-key" [class.op]="isOp(k)" [class.clear]="k === 'C'" [class.wide]="k === '0'" (click)="press(k)">{{ k }}</button>
                            }
                        </div>
                    </div>
                }
            }
            <div class="fs-id">ID {{ deviceId() }}</div>
        </div>
    `,
    styles: [
        `
            .fs-root { position: fixed; inset: 0; z-index: 10000; background: #111827; display: flex; align-items: center; justify-content: center; }
            .fs-media { width: 100%; height: 100%; object-fit: contain; border: 0; }
            .fs-web { background: #fff; }
            .fs-calc { background: #1f2937; padding: 24px; border-radius: 20px; width: min(92vw, 360px); box-shadow: 0 10px 30px rgba(0, 0, 0, 0.8); }
            .fs-display { height: 76px; background: #374151; color: #fff; font-size: 2.6rem; text-align: right; border-radius: 10px; padding: 0 14px; line-height: 76px; margin-bottom: 18px; overflow: hidden; white-space: nowrap; }
            .fs-keys { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; }
            .fs-key { padding: 18px 0; font-size: 1.4rem; font-weight: 700; border: 0; border-radius: 10px; background: #4b5563; color: #fff; cursor: pointer; }
            .fs-key:focus-visible { outline: 3px solid #fff; }
            .fs-key.op { background: #f59e0b; }
            .fs-key.clear { background: #ef4444; }
            .fs-key.wide { grid-column: span 2; }
            .fs-id { position: absolute; bottom: 8px; left: 0; right: 0; text-align: center; color: rgba(255, 255, 255, 0.3); font: 11px monospace; }
        `,
    ],
})
export class FakeScreenComponent {
    readonly screen = input.required<PanelFakeScreen>();
    readonly deviceId = input<string>('');
    readonly unlocked = output<void>();

    readonly keys = KEYS;
    readonly display = signal('');
    readonly index = signal(0);
    private readonly sanitizer = inject(DomSanitizer);
    // only http(s) URLs reach here (parseFakeScreen), shown in a sandboxed iframe
    readonly webUrl = computed<SafeResourceUrl>(() => this.sanitizer.bypassSecurityTrustResourceUrl(this.screen().url));

    constructor() {
        // carousel: next image every `interval` seconds (the input is read on each tick)
        let seconds = 0;
        const timer = setInterval(() => {
            const s = this.screen();
            if (s.type !== 'carrusel' || s.images.length < 2 || ++seconds < s.interval) return;
            seconds = 0;
            this.index.set((this.index() + 1) % s.images.length);
        }, 1000);
        inject(DestroyRef).onDestroy(() => clearInterval(timer));
    }

    isOp(k: string): boolean {
        return '÷×-+='.includes(k);
    }

    press(k: string): void {
        if (k === 'C') return this.display.set('');
        if (k === '=') {
            const code = this.screen().unlock;
            if (code && this.display() === code) {
                this.display.set('');
                this.unlocked.emit();
                return;
            }
            return this.display.set(calculate(this.display()));
        }
        this.display.set((this.display() === 'Error' ? '' : this.display()) + k);
    }
}
