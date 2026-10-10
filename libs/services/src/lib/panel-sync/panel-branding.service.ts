import { computed, Injectable, signal } from '@angular/core';
import {
    applyTenantTheme,
    formatTenantExpiry,
    PANEL_TENANT_CHANGED_EVENT,
    PanelTenantCache,
    PanelTenantChoice,
    readTenantCache,
    readTenantChoice,
} from '@iptvnator/shared/interfaces';

/** Built-in brand, used with "Omitir" and for every field the distributor leaves empty. */
export const DEFAULT_BRAND_NAME = 'LatMpx TV+';

/**
 * Distributor branding for every screen: name, logo, palette and features.
 * Reads the cache saved by the guardian (apps/web panel-tenant.service.ts)
 * and repaints whenever it changes.
 */
@Injectable({ providedIn: 'root' })
export class PanelBrandingService {
    readonly choice = signal<PanelTenantChoice>('none');
    readonly tenant = signal<PanelTenantCache | null>(null);

    readonly code = computed(() => this.tenant()?.code ?? '');
    /** Distributor name, null for the built-in brand. */
    readonly name = computed(() => this.tenant()?.name ?? null);
    readonly brandName = computed(() => this.name() ?? DEFAULT_BRAND_NAME);
    readonly logoUrl = computed(() => this.tenant()?.logoUrl ?? null);
    readonly features = computed(
        () => this.tenant()?.features ?? { demo: true, alerts: true, sports: true }
    );
    /** DD/MM/AAAA (Panama time), '' when it never expires or with "Omitir". */
    readonly expiry = computed(() => {
        const t = this.tenant();
        return t ? formatTenantExpiry(t) : '';
    });

    private lastCss = '\u0000';

    constructor() {
        this.reload();
        globalThis.addEventListener?.(PANEL_TENANT_CHANGED_EVENT, () => this.reload());
    }

    /** Re-reads the stored choice and repaints (palette, title). */
    reload(): void {
        this.choice.set(readTenantChoice());
        const tenant = readTenantCache();
        this.tenant.set(tenant);
        const key = JSON.stringify(tenant?.palette ?? null);
        if (key !== this.lastCss && typeof document !== 'undefined') {
            this.lastCss = key;
            applyTenantTheme(tenant?.palette ?? null);
        }
        if (typeof document !== 'undefined') document.title = this.brandName();
    }
}
