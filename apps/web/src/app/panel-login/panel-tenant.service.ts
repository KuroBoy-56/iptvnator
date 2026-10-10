import { inject, Injectable, Injector, signal } from '@angular/core';
import { Router } from '@angular/router';
import { PanelBrandingService } from '@iptvnator/services';
import {
    clearTenant,
    forgetTenantStorage,
    isTenantCode,
    isTenantErrorCode,
    isTenantExpired,
    PANEL_TENANT_ERROR_EVENT,
    PANEL_TENANT_FATAL,
    PANEL_TENANT_MESSAGES,
    PanelTenantErrorCode,
    readTenantCache,
    readTenantCode,
    saveTenantCode,
    saveTenantSkip,
    tenantExpiredMessage,
} from '@iptvnator/shared/interfaces';
import { AuthService } from '../auth.service';
import { PanelLoginService } from './panel-login.service';
import { PanelSessionService } from './panel-session.service';

/** Without a successful check for this long, the app stops and asks to retry. */
export const TENANT_OFFLINE_GRACE_MS = 72 * 3600 * 1000;
/** How often the app looks whether a background check is due. */
const DUE_POLL_MS = 10 * 60 * 1000;

export type TenantGuardResult = 'ok' | 'offline' | 'wiped' | 'retry';

/**
 * Guardian of the chosen distributor: re-checks api/login.php tenant_config
 * at launch, on resume and every recheck_after seconds. An invalid, expired,
 * suspended or unlinked distributor wipes the code, the branding and the
 * session and sends the user back to the distributor step.
 */
@Injectable({ providedIn: 'root' })
export class PanelTenantService {
    private readonly panel = inject(PanelLoginService);
    // resolved lazily: this service starts in an app initializer
    private readonly injector = inject(Injector);
    readonly branding = inject(PanelBrandingService);

    /** Message shown on the distributor step after a wipe. */
    readonly notice = signal<string | null>(null);
    /** Set when the panel could not confirm the distributor for 72 h: login shows "Reintentar". */
    readonly retryMessage = signal<string | null>(null);

    private started = false;
    private checking: Promise<TenantGuardResult> | null = null;

    /** Called once at bootstrap: cached branding is already painted by PanelBrandingService. */
    start(): void {
        if (this.started) return;
        this.started = true;
        this.branding.reload();
        globalThis.addEventListener?.(PANEL_TENANT_ERROR_EVENT, (event) => {
            const code = (event as CustomEvent).detail;
            if (isTenantErrorCode(code) && PANEL_TENANT_FATAL.includes(code)) void this.wipe(this.messageFor(code));
        });
        globalThis.document?.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'visible') void this.checkIfDue();
        });
        globalThis.addEventListener?.('focus', () => void this.checkIfDue());
        setInterval(() => void this.checkIfDue(), DUE_POLL_MS);
        if (readTenantCode()) void this.check();
    }

    private async checkIfDue(): Promise<void> {
        const cache = readTenantCache();
        if (!cache) return;
        if (isTenantExpired(cache) || Date.now() - cache.lastOkCheck >= cache.recheckAfter * 1000) {
            await this.check();
        }
    }

    /** One background check (concurrent callers share it). */
    check(): Promise<TenantGuardResult> {
        this.checking ??= this.runCheck().finally(() => (this.checking = null));
        return this.checking;
    }

    private async runCheck(): Promise<TenantGuardResult> {
        const code = readTenantCode();
        if (!code) return 'ok';
        const cached = readTenantCache();
        if (cached && isTenantExpired(cached)) {
            await this.wipe(tenantExpiredMessage(cached));
            return 'wiped';
        }
        const res = await this.panel.tenantConfig(code);
        if (res.status === 'ok') {
            if (isTenantExpired(res.cache)) {
                await this.wipe(tenantExpiredMessage(res.cache));
                return 'wiped';
            }
            saveTenantCode(res.cache);
            this.retryMessage.set(null);
            return 'ok';
        }
        if (res.status === 'tenant_error' && PANEL_TENANT_FATAL.includes(res.code)) {
            await this.wipe(this.messageFor(res.code, cached));
            return 'wiped';
        }
        // network, 5xx, 429…: the cache keeps working for a while
        if (cached && Date.now() - cached.lastOkCheck < TENANT_OFFLINE_GRACE_MS) return 'offline';
        this.retryMessage.set('No se pudo verificar tu distribuidor con el panel. Revisa tu conexión e inténtalo de nuevo.');
        await this.injector.get(Router).navigate(['/login']);
        return 'retry';
    }

    /**
     * Distributor step "Continuar": validates the code against the panel and
     * stores it. Returns the error message to show, or null on success.
     */
    async submit(code: string): Promise<string | null> {
        const value = code.trim();
        if (!isTenantCode(value)) return 'Escribe los 6 dígitos de tu número de distribuidor.';
        const res = await this.panel.tenantConfig(value);
        if (res.status !== 'ok') return res.message;
        if (isTenantExpired(res.cache)) return tenantExpiredMessage(res.cache);
        saveTenantCode(res.cache);
        this.notice.set(null);
        this.retryMessage.set(null);
        return null;
    }

    /** Distributor step "Omitir": the app works exactly as before, never asks again. */
    skip(): void {
        saveTenantSkip();
        this.notice.set(null);
        this.retryMessage.set(null);
    }

    /** Settings "Cambiar distribuidor": forget it, log out and show the distributor step. */
    async change(): Promise<void> {
        await this.wipe(null);
    }

    private messageFor(code: PanelTenantErrorCode, cache = readTenantCache()): string {
        return code === 'tenant_expired' && cache ? tenantExpiredMessage(cache) : PANEL_TENANT_MESSAGES[code];
    }

    private async wipe(message: string | null): Promise<void> {
        const code = readTenantCode();
        clearTenant();
        if (code) forgetTenantStorage(code);
        this.retryMessage.set(null);
        this.notice.set(message);
        try {
            await this.injector.get(PanelSessionService).clear();
        } catch {
            // the session keys are removed below anyway
        }
        this.injector.get(AuthService).logout();
        await this.injector.get(Router).navigate(['/login']);
    }
}
