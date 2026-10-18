import { ChangeDetectionStrategy, Component, computed, OnInit, signal, ViewEncapsulation } from '@angular/core';
import { MatMenuModule } from '@angular/material/menu';
import { TranslatePipe } from '@ngx-translate/core';
import {
    ElectronBridgeApi,
    SECURE_DNS_OPTIONS,
    SecureDnsMode,
} from '@iptvnator/shared/interfaces';

function bridge(): Partial<ElectronBridgeApi> | undefined {
    return (window as unknown as { electron?: Partial<ElectronBridgeApi> }).electron;
}

/**
 * DNS button (login screen and Settings), as in the Android, iOS and TV apps.
 * «Automático» keeps the automatic DNS-over-HTTPS fallback; a provider is used
 * always. Applied and saved by the Electron main process (smart-dns.service).
 * La lista es un mat-menu: se abre en una capa sobre la ventana (abajo, arriba o
 * empujada dentro), nunca cortada; si no cabe se desplaza (rueda/táctil) y se
 * maneja con flechas, Enter y Esc.
 */
@Component({
    standalone: true,
    selector: 'app-secure-dns-picker',
    imports: [MatMenuModule, TranslatePipe],
    changeDetection: ChangeDetectionStrategy.OnPush,
    // el panel del menú vive en la capa del overlay, fuera de este componente
    encapsulation: ViewEncapsulation.None,
    template: `
        @if (available) {
            <button
                type="button"
                class="dns-trigger"
                [class.on]="mode() !== 'automatic'"
                [matMenuTriggerFor]="dnsMenu"
            >
                <span aria-hidden="true">🛡️</span> DNS: {{ current().id === 'automatic' ? ('MPX.DNS.AUTOMATIC_LABEL' | translate) : current().label }}
            </button>
            <mat-menu #dnsMenu="matMenu" class="dns-menu">
                @for (option of options; track option.id) {
                    <button
                        mat-menu-item
                        type="button"
                        role="menuitemradio"
                        [attr.aria-checked]="option.id === mode()"
                        [class.selected]="option.id === mode()"
                        (click)="select(option.id)"
                    >
                        <span class="dns-option">
                            <strong>{{ option.id === 'automatic' ? ('MPX.DNS.AUTOMATIC_LABEL' | translate) : option.label }}</strong>
                            <small>{{ option.descriptionKey | translate }}</small>
                        </span>
                    </button>
                }
            </mat-menu>
        }
    `,
    styles: `
        app-secure-dns-picker { display: block; }
        app-secure-dns-picker .dns-trigger {
            width: 100%; padding: 10px 14px; border-radius: 6px; cursor: pointer;
            border: 1px solid rgba(255, 255, 255, 0.35); background: rgba(22, 22, 22, 0.7);
            color: #fff; font-weight: 600; font-size: 14px;
        }
        app-secure-dns-picker .dns-trigger.on { border-color: #e50914; background: rgba(229, 9, 20, 0.15); }
        app-secure-dns-picker .dns-trigger:focus-visible { outline: 2px solid var(--nf-focus, #fff); outline-offset: 2px; }
        .mat-mdc-menu-panel.dns-menu {
            min-width: 260px; max-width: min(360px, calc(100vw - 32px));
            background: #181818; border: 1px solid #333;
        }
        .dns-menu .mat-mdc-menu-item { min-height: 52px; padding: 6px 14px; }
        .dns-menu .mat-mdc-menu-item.selected,
        .dns-menu .mat-mdc-menu-item:hover,
        .dns-menu .mat-mdc-menu-item.cdk-keyboard-focused { background: rgba(229, 9, 20, 0.2); }
        .dns-menu .dns-option {
            display: flex; flex-direction: column; align-items: flex-start; gap: 2px;
            color: #e5e5e5; white-space: normal; text-align: left;
        }
        .dns-menu .dns-option small { color: #b3b3b3; }
    `,
})
export class SecureDnsPickerComponent implements OnInit {
    readonly options = SECURE_DNS_OPTIONS;
    readonly available = typeof bridge()?.setSecureDns === 'function';
    readonly mode = signal<SecureDnsMode>('automatic');
    readonly current = computed(
        () => this.options.find((o) => o.id === this.mode()) ?? this.options[0]
    );

    async ngOnInit(): Promise<void> {
        try {
            const stored = await bridge()?.getSecureDns?.();
            if (stored) this.mode.set(stored);
        } catch {
            // Keep the default label.
        }
    }

    async select(mode: SecureDnsMode): Promise<void> {
        try {
            this.mode.set((await bridge()?.setSecureDns?.(mode)) ?? mode);
        } catch {
            this.mode.set('automatic');
        }
    }
}
