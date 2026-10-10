import { Injectable } from '@angular/core';
import {
    ElectronBridgeApi,
    isResellerCode,
    normalizeXtreamServerUrl,
    PanelLoginAction,
    PanelLoginPayload,
    PanelLoginResult,
    PANEL_TENANT_FATAL,
    PANEL_TENANT_MESSAGES,
    PanelTenantCache,
    PanelTenantErrorCode,
    notifyTenantError,
    parseTenantConfig,
    readTenantCode,
    tenantErrorCode,
} from '@iptvnator/shared/interfaces';
import { PanelFakeScreen, parseFakeScreen } from './fake-screen/fake-screen.util';

export interface PanelAccount {
    server: string;
    username: string;
    password: string;
    isDemo: boolean;
}

export type DeviceCheck =
    | { status: 'active'; account: PanelAccount }
    | { status: 'inactive'; fake?: PanelFakeScreen | null }
    | { status: 'error'; message: string };

export type DemoResult =
    | { ok: true; username: string; password: string }
    | { ok: false; message: string; blocked: boolean };

export type TenantCheck =
    | { status: 'ok'; cache: PanelTenantCache }
    | { status: 'tenant_error'; code: PanelTenantErrorCode; message: string }
    | { status: 'no_key'; message: string }
    | { status: 'network'; message: string };

const DEMO_PREFIX = 'demo_';
export const NO_PANEL_KEY_MESSAGE = 'Esta versión de la app no tiene la llave del panel';

/** ".../get.php?username=u&password=p&type=…" -> server + credentials. */
export function parsePanelLineUrl(url: string): Omit<PanelAccount, 'isDemo'> | null {
    try {
        const parsed = new URL(url);
        const username = parsed.searchParams.get('username') ?? '';
        const password = parsed.searchParams.get('password') ?? '';
        if (!username || !password) return null;
        return { server: normalizeXtreamServerUrl(parsed.origin), username, password };
    } catch {
        return null;
    }
}

export function isDemoUser(username: string): boolean {
    return username.toLowerCase().startsWith(DEMO_PREFIX);
}

function bridge(): Partial<ElectronBridgeApi> | undefined {
    return (window as unknown as { electron?: Partial<ElectronBridgeApi> }).electron;
}

/**
 * Device activation through the panel's api/login.php, the same flow as the
 * Android app. Encryption and the master key stay in the Electron main
 * process; this service only calls the bridge.
 */
@Injectable({ providedIn: 'root' })
export class PanelLoginService {
    get available(): boolean {
        return typeof bridge()?.panelLoginRequest === 'function';
    }

    async deviceId(): Promise<string> {
        try {
            return (await bridge()?.panelGetDeviceId?.()) ?? '';
        } catch {
            return '';
        }
    }

    private async request<T>(
        action: PanelLoginAction,
        payload?: PanelLoginPayload
    ): Promise<PanelLoginResult<T>> {
        const fn = bridge()?.panelLoginRequest;
        if (typeof fn !== 'function') {
            return { ok: false, status: 0, code: 'NETWORK', error: 'El inicio de sesión del panel solo está disponible en la app de escritorio.' };
        }
        // the chosen distributor goes with every action; none with "Omitir"
        const tenant = readTenantCode();
        const res = await fn<T>(action, tenant ? { ...payload, tenant } : payload);
        const code = tenant && !res.ok ? tenantErrorCode(res.data) : null;
        if (code && PANEL_TENANT_FATAL.includes(code)) notifyTenantError(code);
        return res;
    }

    /** api/login.php tenant_config for a distributor code (the guardian and the distributor step). */
    async tenantConfig(code: string): Promise<TenantCheck> {
        const fn = bridge()?.panelLoginRequest;
        if (typeof fn !== 'function') {
            return { status: 'network', message: 'El panel solo está disponible en la app de escritorio.' };
        }
        let res: PanelLoginResult;
        try {
            res = await fn('tenant_config', { tenant: code });
        } catch {
            res = { ok: false, status: 0, code: 'NETWORK' };
        }
        if (res.code === 'NO_MASTER_KEY') return { status: 'no_key', message: NO_PANEL_KEY_MESSAGE };
        const cache = res.ok ? parseTenantConfig(res.data) : null;
        if (cache) return { status: 'ok', cache };
        const error = tenantErrorCode(res.data);
        if (error) return { status: 'tenant_error', code: error, message: PANEL_TENANT_MESSAGES[error] };
        return { status: 'network', message: 'No se pudo conectar con el panel. Revisa tu conexión.' };
    }

    async checkDevice(): Promise<DeviceCheck> {
        const res = await this.request<{ exists?: boolean; username?: string; password?: string; url?: string }>('check_mac');
        if (!res.ok) return { status: 'error', message: res.error ?? 'No se pudo verificar el dispositivo.' };
        const data = res.data;
        // fake screen of the panel for new devices («Pantalla Falsa»)
        if (!data?.exists || !data.url) return { status: 'inactive', fake: parseFakeScreen(data) };
        const line = parsePanelLineUrl(data.url);
        if (!line) return { status: 'inactive', fake: parseFakeScreen(data) };
        return { status: 'active', account: { ...line, isDemo: isDemoUser(line.username) } };
    }

    async fetchDns(): Promise<string[]> {
        const res = await this.request<string[]>('fetch_dns');
        return res.ok && Array.isArray(res.data) ? res.data : [];
    }

    async activate(username: string, password: string, dns: string): Promise<{ ok: boolean; message?: string }> {
        const res = await this.request<{ status?: string }>('submit_url', { username, password, url: dns });
        if (res.ok && res.data?.status === 'ok') return { ok: true };
        return { ok: false, message: res.error ?? 'No se pudo activar el dispositivo.' };
    }

    /** A reseller demo code (see isResellerCode) registers the demo under that reseller. */
    async autoDemo(reseller?: string): Promise<DemoResult> {
        const res = await this.request<{ status?: string; username?: string; password?: string }>(
            'auto_demo',
            isResellerCode(reseller) ? { reseller: reseller.trim().toUpperCase() } : undefined
        );
        if (res.ok && res.data?.status === 'ok' && res.data.username && res.data.password) {
            return { ok: true, username: res.data.username, password: res.data.password };
        }
        return {
            ok: false,
            message: res.error ?? 'No se pudo generar la demo.',
            // 404: unknown reseller code or no demo configured; the demo stays available
            blocked: res.status === 403,
        };
    }
}
