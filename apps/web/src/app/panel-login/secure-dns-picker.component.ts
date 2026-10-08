import { ChangeDetectionStrategy, Component, computed, OnInit, signal } from '@angular/core';
import {
    ElectronBridgeApi,
    SECURE_DNS_OPTIONS,
    SecureDnsMode,
} from '@iptvnator/shared/interfaces';

function bridge(): Partial<ElectronBridgeApi> | undefined {
    return (window as unknown as { electron?: Partial<ElectronBridgeApi> }).electron;
}

/**
 * DNS selector shown on the login screen and in settings only. The choice is
 * applied and persisted by the Electron main process (DNS-over-HTTPS).
 */
@Component({
    selector: 'app-secure-dns-picker',
    changeDetection: ChangeDetectionStrategy.OnPush,
    template: `
        @if (available) {
            <div class="dns-picker">
                <button
                    type="button"
                    class="dns-trigger"
                    [class.on]="mode() !== 'automatic'"
                    [attr.aria-expanded]="open()"
                    (click)="open.set(!open())"
                >
                    <span aria-hidden="true">🛡️</span> DNS: {{ current().label }}
                </button>
                @if (open()) {
                    <ul class="dns-menu" role="listbox">
                        @for (option of options; track option.id) {
                            <li>
                                <button
                                    type="button"
                                    role="option"
                                    [attr.aria-selected]="option.id === mode()"
                                    [class.selected]="option.id === mode()"
                                    (click)="select(option.id)"
                                >
                                    <strong>{{ option.label }}</strong>
                                    <small>{{ option.description }}</small>
                                </button>
                            </li>
                        }
                    </ul>
                }
            </div>
        }
    `,
    styles: `
        :host { display: block; }
        .dns-picker { position: relative; }
        .dns-trigger {
            width: 100%; padding: 10px 14px; border-radius: 6px; cursor: pointer;
            border: 1px solid rgba(255, 255, 255, 0.35); background: rgba(22, 22, 22, 0.7);
            color: #fff; font-weight: 600; font-size: 14px;
        }
        .dns-trigger.on { border-color: var(--nf-red, #e50914); background: color-mix(in srgb, var(--nf-red, #e50914) 15%, transparent); }
        .dns-menu {
            position: absolute; z-index: 20; left: 0; right: 0; top: calc(100% + 6px);
            margin: 0; padding: 6px; list-style: none; border-radius: 8px;
            background: #181818; border: 1px solid #333; box-shadow: 0 12px 30px rgba(0, 0, 0, 0.6);
        }
        .dns-menu button {
            width: 100%; display: flex; flex-direction: column; align-items: flex-start; gap: 2px;
            padding: 8px 10px; border: 0; border-radius: 6px; background: transparent; color: #e5e5e5;
            cursor: pointer; text-align: left;
        }
        .dns-menu button:hover, .dns-menu button.selected { background: rgba(229, 9, 20, 0.2); }
        .dns-menu small { color: #b3b3b3; }
    `,
})
export class SecureDnsPickerComponent implements OnInit {
    readonly options = SECURE_DNS_OPTIONS;
    readonly available = typeof bridge()?.setSecureDns === 'function';
    readonly mode = signal<SecureDnsMode>('automatic');
    readonly open = signal(false);
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
        this.open.set(false);
        try {
            this.mode.set((await bridge()?.setSecureDns?.(mode)) ?? mode);
        } catch {
            this.mode.set('automatic');
        }
    }
}
