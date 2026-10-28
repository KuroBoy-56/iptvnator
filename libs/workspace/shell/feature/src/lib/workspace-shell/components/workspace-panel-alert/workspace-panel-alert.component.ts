import {
    ChangeDetectionStrategy,
    Component,
    computed,
    effect,
    ElementRef,
    HostListener,
    OnDestroy,
    OnInit,
    signal,
    viewChild,
} from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { fetchPanelAlert, PanelAlert } from './panel-alert.util';

/**
 * Welcome / expiry notice configured in the panel ("Alertas"), shown once
 * when the workspace opens. Rendered natively from the panel JSON (no remote
 * HTML runs inside the app); "Entendido", Esc or Enter close it.
 */
@Component({
    selector: 'app-workspace-panel-alert',
    imports: [TranslatePipe],
    templateUrl: './workspace-panel-alert.component.html',
    styleUrl: './workspace-panel-alert.component.scss',
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WorkspacePanelAlertComponent implements OnInit, OnDestroy {
    readonly alert = signal<PanelAlert | null>(null);
    /** images of the panel list (several change every `interval` s in the same place) */
    readonly images = computed(() => {
        const a = this.alert();
        if (!a) return [];
        return a.images?.length ? a.images : a.image ? [a.image] : [];
    });
    readonly imageIndex = signal(0);
    private readonly button = viewChild<ElementRef<HTMLButtonElement>>('okButton');
    private timer: ReturnType<typeof setInterval> | null = null;

    constructor() {
        effect(() => this.button()?.nativeElement.focus());
        effect(() => {
            const list = this.images();
            const secs = Math.max(1, this.alert()?.interval ?? 3);
            this.stopTimer();
            this.imageIndex.set(0);
            if (list.length > 1) {
                this.timer = setInterval(() => this.imageIndex.update(i => (i + 1) % list.length), secs * 1000);
            }
        });
    }

    ngOnDestroy(): void {
        this.stopTimer();
    }

    private stopTimer(): void {
        if (this.timer) clearInterval(this.timer);
        this.timer = null;
    }

    async ngOnInit(): Promise<void> {
        this.alert.set(await fetchPanelAlert());
    }

    close(): void {
        this.alert.set(null);
    }

    @HostListener('document:keydown', ['$event'])
    onKeydown(event: KeyboardEvent): void {
        if (!this.alert()) return;
        if (event.key === 'Escape' || event.key === 'Enter') {
            event.preventDefault();
            event.stopPropagation();
            this.close();
        }
    }
}
