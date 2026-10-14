import { Injectable } from '@angular/core';
import {
    currentAppLanguage,
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
    UiText,
} from '@iptvnator/shared/interfaces';
import { PanelFakeScreen, parseFakeScreen } from './fake-screen/fake-screen.util';

export interface PanelAccount {
    server: string;
    username: string;
    password: string;
    isDemo: boolean;
    /** demo: end (unix seconds) and length (seconds) as the panel says */
    demoExpires?: number;
    demoDuration?: number;
}

export type DeviceCheck =
    | { status: 'active'; account: PanelAccount }
    | { status: 'inactive'; fake?: PanelFakeScreen | null }
    | { status: 'error'; message: UiText };

export type DemoResult =
    /** url: the demo's server as the panel gives it ('' on older panels) */
    | { ok: true; username: string; password: string; url: string; expires: number; duration: number }
    | { ok: false; message: UiText; blocked: boolean };

export type TenantCheck =
    | { status: 'ok'; cache: PanelTenantCache }
    | { status: 'tenant_error'; code: PanelTenantErrorCode; message: UiText }
    | { status: 'no_key'; message: UiText }
    | { status: 'network'; message: UiText };

const DEMO_PREFIX = 'demo_';
export const NO_PANEL_KEY_MESSAGE: UiText = { key: 'MPX.PANEL.ERR_NO_KEY' };
const DESKTOP_ONLY: UiText = { key: 'MPX.PANEL.ERR_DESKTOP_ONLY' };

/**
 * Error text of a failed request: the panel's own message (it answers in the
 * app language) or the app's text for local failures (network, no key…).
 */
export function panelErrorText(res: PanelLoginResult, fallbackKey: string): UiText {
    if (res.code === 'NETWORK') return { key: 'MPX.PANEL.ERR_NETWORK' };
    if (res.code === 'NO_MASTER_KEY') return NO_PANEL_KEY_MESSAGE;
    if (res.code === 'BAD_RESPONSE') return { key: 'MPX.PANEL.ERR_BAD_RESPONSE' };
    const data = res.data as { error?: unknown; message?: unknown } | undefined;
    const own = data?.error ?? data?.message ?? (res.code ? undefined : res.error);
    if (typeof own === 'string' && own) return { key: own };
    if (res.code === 'HTTP') return { key: 'MPX.PANEL.ERR_HTTP', params: { status: res.status } };
    return { key: fallbackKey };
}

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
            return { ok: false, status: 0, code: 'NETWORK' };
        }
        // the chosen distributor goes with every action (none with "Omitir"); the panel answers in the app language
        const tenant = readTenantCode();
        const lang = currentAppLanguage();
        const res = await fn<T>(action, tenant ? { ...payload, tenant, lang } : { ...payload, lang });
        const code = tenant && !res.ok ? tenantErrorCode(res.data) : null;
        if (code && PANEL_TENANT_FATAL.includes(code)) notifyTenantError(code);
        return res;
    }

    /** api/login.php tenant_config for a distributor code (the guardian and the distributor step). */
    async tenantConfig(code: string): Promise<TenantCheck> {
        const fn = bridge()?.panelLoginRequest;
        if (typeof fn !== 'function') {
            return { status: 'network', message: DESKTOP_ONLY };
        }
        let res: PanelLoginResult;
        try {
            res = await fn('tenant_config', { tenant: code, lang: currentAppLanguage() });
        } catch {
            res = { ok: false, status: 0, code: 'NETWORK' };
        }
        if (res.code === 'NO_MASTER_KEY') return { status: 'no_key', message: NO_PANEL_KEY_MESSAGE };
        const cache = res.ok ? parseTenantConfig(res.data) : null;
        if (cache) return { status: 'ok', cache };
        const error = tenantErrorCode(res.data);
        if (error) return { status: 'tenant_error', code: error, message: { key: PANEL_TENANT_MESSAGES[error] } };
        return { status: 'network', message: { key: 'MPX.PANEL.ERR_CONNECT' } };
    }

    async checkDevice(): Promise<DeviceCheck> {
        const res = await this.request<{
            exists?: boolean;
            username?: string;
            password?: string;
            url?: string;
            demo?: boolean;
            demo_expires?: number;
            demo_duration?: number;
        }>('check_mac');
        if (!res.ok) return { status: 'error', message: panelErrorText(res, 'MPX.PANEL.ERR_CHECK_DEVICE') };
        const data = res.data;
        // fake screen of the panel for new devices («Pantalla Falsa»)
        if (!data?.exists || !data.url) return { status: 'inactive', fake: parseFakeScreen(data) };
        const line = parsePanelLineUrl(data.url);
        if (!line) return { status: 'inactive', fake: parseFakeScreen(data) };
        // the panel says when the line is a demo; old panels: the "demo_" user name
        return {
            status: 'active',
            account: {
                ...line,
                isDemo: data.demo === true || isDemoUser(line.username),
                demoExpires: Number(data.demo_expires) || 0,
                demoDuration: Number(data.demo_duration) || 0,
            },
        };
    }

    async fetchDns(): Promise<string[]> {
        const res = await this.request<string[]>('fetch_dns');
        return res.ok && Array.isArray(res.data) ? res.data : [];
    }

    async activate(username: string, password: string, dns: string): Promise<{ ok: boolean; message?: UiText }> {
        const res = await this.request<{ status?: string }>('submit_url', { username, password, url: dns });
        if (res.ok && res.data?.status === 'ok') return { ok: true };
        return { ok: false, message: panelErrorText(res, 'MPX.PANEL.ERR_ACTIVATE') };
    }

    /** A reseller demo code (see isResellerCode) registers the demo under that reseller. */
    async autoDemo(reseller?: string): Promise<DemoResult> {
        const res = await this.request<{
            status?: string;
            username?: string;
            password?: string;
            url?: string;
            demo_expires?: number;
            demo_duration?: number;
        }>(
            'auto_demo',
            isResellerCode(reseller) ? { reseller: reseller.trim().toUpperCase() } : undefined
        );
        if (res.ok && res.data?.status === 'ok' && res.data.username && res.data.password) {
            return {
                ok: true,
                username: res.data.username,
                password: res.data.password,
                url: (res.data.url ?? '').trim(),
                expires: Number(res.data.demo_expires) || 0,
                duration: Number(res.data.demo_duration) || 0,
            };
        }
        return {
            ok: false,
            message: panelErrorText(res, 'MPX.PANEL.ERR_DEMO'),
            // 404: unknown reseller code or no demo configured; the demo stays available
            blocked: res.status === 403,
        };
    }
}
