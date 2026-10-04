import { Injectable } from '@angular/core';
import {
    ElectronBridgeApi,
    normalizeXtreamServerUrl,
    PanelLoginAction,
    PanelLoginPayload,
    PanelLoginResult,
} from '@iptvnator/shared/interfaces';

export interface PanelAccount {
    server: string;
    username: string;
    password: string;
    isDemo: boolean;
}

export type DeviceCheck =
    | { status: 'active'; account: PanelAccount }
    | { status: 'inactive' }
    | { status: 'error'; message: string };

export type DemoResult =
    | { ok: true; username: string; password: string }
    | { ok: false; message: string; blocked: boolean };

const DEMO_PREFIX = 'demo_';

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
        return fn<T>(action, payload);
    }

    async checkDevice(): Promise<DeviceCheck> {
        const res = await this.request<{ exists?: boolean; username?: string; password?: string; url?: string }>('check_mac');
        if (!res.ok) return { status: 'error', message: res.error ?? 'No se pudo verificar el dispositivo.' };
        const data = res.data;
        if (!data?.exists || !data.url) return { status: 'inactive' };
        const line = parsePanelLineUrl(data.url);
        if (!line) return { status: 'inactive' };
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

    async autoDemo(): Promise<DemoResult> {
        const res = await this.request<{ status?: string; username?: string; password?: string }>('auto_demo');
        if (res.ok && res.data?.status === 'ok' && res.data.username && res.data.password) {
            return { ok: true, username: res.data.username, password: res.data.password };
        }
        return {
            ok: false,
            message: res.error ?? 'No se pudo generar la demo.',
            blocked: res.status === 403,
        };
    }
}
