import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { formatTenantExpiry } from '@iptvnator/shared/interfaces';
import { map } from 'rxjs';
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
    imports: [MatButtonModule, TranslatePipe],
    changeDetection: ChangeDetectionStrategy.OnPush,
    template: `
        <section class="settings-distributor" data-test-id="settings-distributor">
            <h3>{{ 'MPX.DIST.SECTION' | translate }}</h3>
            @if (branding.tenant(); as tenant) {
                <div class="row">{{ 'MPX.DIST.NAME' | translate }} <b>{{ tenant.name ?? ('MPX.DIST.NO_NAME' | translate) }}</b> ({{ tenant.code }})</div>
                @if (expiry(); as expiry) {
                    <div class="row">{{ 'MPX.DIST.EXPIRES' | translate }} <b>{{ expiry }}</b> {{ 'MPX.DIST.PANAMA_TIME' | translate }}</div>
                }
            } @else {
                <div class="row">{{ 'MPX.DIST.NONE' | translate }}</div>
            }
            <button mat-stroked-button type="button" [disabled]="busy()" (click)="change()">
                {{ (branding.tenant() ? 'MPX.DIST.CHANGE' : 'MPX.DIST.ENTER') | translate }}
            </button>
            <p>{{ 'MPX.DIST.CHANGE_NOTE' | translate }}</p>
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
    private readonly translate = inject(TranslateService);
    private readonly lang = toSignal(this.translate.onLangChange.pipe(map((e) => e.lang)), {
        initialValue: this.translate.currentLang || this.translate.defaultLang,
    });
    /** Expiry date (Panama time) in the date format of the app language. */
    protected readonly expiry = computed(() => {
        const tenant = this.branding.tenant();
        return tenant ? formatTenantExpiry(tenant, this.lang()) : '';
    });

    async change(): Promise<void> {
        if (!confirm(this.translate.instant('MPX.DIST.CHANGE_CONFIRM'))) return;
        this.busy.set(true);
        try {
            await this.tenantService.change();
        } finally {
            this.busy.set(false);
        }
    }
}
