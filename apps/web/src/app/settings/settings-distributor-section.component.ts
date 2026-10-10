import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { PanelTenantService } from '../panel-login/panel-tenant.service';

/**
 * "Distribuidor" box in Settings: the chosen distributor, its expiry (Panama
 * time) and "Cambiar distribuidor", which forgets it, logs out and shows the
 * distributor step again. With "Omitir" the same action lets the user enter
 * a code later.
 */
@Component({
    selector: 'app-settings-distributor-section',
    standalone: true,
    imports: [MatButtonModule],
    changeDetection: ChangeDetectionStrategy.OnPush,
    template: `
        <section class="settings-distributor" data-test-id="settings-distributor">
            <h3>Distribuidor</h3>
            @if (branding.tenant(); as tenant) {
                <div class="row">Distribuidor: <b>{{ tenant.name ?? 'Sin nombre' }}</b> ({{ tenant.code }})</div>
                @if (branding.expiry(); as expiry) {
                    <div class="row">Vence: <b>{{ expiry }}</b> (hora de Panamá)</div>
                }
            } @else {
                <div class="row">Sin número de distribuidor.</div>
            }
            <button mat-stroked-button type="button" [disabled]="busy()" (click)="change()">
                {{ branding.tenant() ? 'Cambiar distribuidor' : 'Ingresar número de distribuidor' }}
            </button>
            <p>Se cerrará la sesión y la app pedirá el número de distribuidor.</p>
        </section>
    `,
    styles: `
        .settings-distributor {
            max-width: 420px;
            margin: 0 0 20px;
            padding: 16px 20px;
            border-radius: 8px;
            border: 1px solid rgba(255, 255, 255, 0.1);
            background: rgba(0, 0, 0, 0.15);
        }
        h3 { margin: 0 0 12px; }
        .row { margin: 0 0 8px; }
        button { margin-top: 8px; }
        p { margin: 10px 0 0; font-size: 13px; opacity: 0.7; }
    `,
})
export class SettingsDistributorSectionComponent {
    private readonly tenantService = inject(PanelTenantService);
    protected readonly branding = this.tenantService.branding;
    protected readonly busy = signal(false);

    async change(): Promise<void> {
        if (!confirm('¿Cambiar de distribuidor? Se cerrará la sesión en este dispositivo.')) return;
        this.busy.set(true);
        try {
            await this.tenantService.change();
        } finally {
            this.busy.set(false);
        }
    }
}
