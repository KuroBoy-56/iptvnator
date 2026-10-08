import {
    ChangeDetectionStrategy,
    Component,
    ElementRef,
    HostListener,
    OnInit,
    signal,
    viewChild,
    effect,
} from '@angular/core';
import { fetchPanelAlert, PanelAlert } from './panel-alert.util';

/**
 * Welcome / expiry notice configured in the panel ("Alertas"), shown once
 * when the workspace opens. Rendered natively from the panel JSON (no remote
 * HTML runs inside the app); "Entendido", Esc or Enter close it.
 */
@Component({
    selector: 'app-workspace-panel-alert',
    templateUrl: './workspace-panel-alert.component.html',
    styleUrl: './workspace-panel-alert.component.scss',
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WorkspacePanelAlertComponent implements OnInit {
    readonly alert = signal<PanelAlert | null>(null);
    private readonly button = viewChild<ElementRef<HTMLButtonElement>>('okButton');

    constructor() {
        effect(() => this.button()?.nativeElement.focus());
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
