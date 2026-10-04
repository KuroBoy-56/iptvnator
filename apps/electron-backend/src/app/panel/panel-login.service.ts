import {
    panelEndpoint,
    PanelLoginAction,
    PanelLoginPayload,
    PanelLoginResult,
} from '@iptvnator/shared/interfaces';
import { decryptPayload, encryptPayload } from './panel-crypto';

export type PanelFetch = (
    url: string,
    init: { method: string; headers: Record<string, string>; body: string }
) => Promise<{ status: number; text: () => Promise<string> }>;

export interface PanelLoginDeps {
    fetch: PanelFetch;
    masterKey: Buffer | null;
    deviceId: string;
}

const ACTIONS: readonly PanelLoginAction[] = ['check_mac', 'fetch_dns', 'submit_url', 'auto_demo'];

function parseJson(text: string): unknown {
    try {
        return JSON.parse(text);
    } catch {
        return undefined;
    }
}

function errorMessage(data: unknown, fallback: string): string {
    const value = (data as { error?: unknown; message?: unknown } | undefined) ?? {};
    const message = value.error ?? value.message;
    return typeof message === 'string' && message ? message : fallback;
}

/**
 * Sends one api/login.php request: form fields action + data, where data is
 * the AES-GCM encrypted JSON with the device id as mac_address. fetch_dns
 * answers with an encrypted body; the other actions answer with JSON.
 */
export async function panelLoginRequest(
    action: PanelLoginAction,
    payload: PanelLoginPayload | undefined,
    deps: PanelLoginDeps
): Promise<PanelLoginResult> {
    if (!ACTIONS.includes(action)) {
        return { ok: false, status: 0, code: 'BAD_RESPONSE', error: 'Acción no válida' };
    }
    if (!deps.masterKey) {
        return {
            ok: false,
            status: 0,
            code: 'NO_MASTER_KEY',
            error: 'Esta compilación no tiene la clave del panel (PANEL_MASTER_KEY).',
        };
    }
    const plain = JSON.stringify({
        mac_address: deps.deviceId,
        username: payload?.username?.trim() || undefined,
        password: payload?.password?.trim() || undefined,
        url: payload?.url?.trim() || undefined,
    });
    const body = new URLSearchParams({ action, data: encryptPayload(plain, deps.masterKey) });

    let status = 0;
    let text = '';
    try {
        const res = await deps.fetch(panelEndpoint('login.php'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: body.toString(),
        });
        status = res.status;
        text = await res.text();
    } catch {
        return { ok: false, status: 0, code: 'NETWORK', error: 'No se pudo conectar con el panel.' };
    }

    if (action === 'fetch_dns' && status === 200) {
        const decrypted = decryptPayload(text, deps.masterKey);
        const list = decrypted ? parseJson(decrypted) : undefined;
        return Array.isArray(list)
            ? { ok: true, status, data: list.filter((u) => typeof u === 'string') }
            : { ok: false, status, code: 'BAD_RESPONSE', error: 'Respuesta del panel no válida.' };
    }

    const data = parseJson(text);
    if (status >= 200 && status < 300 && data !== undefined) {
        return { ok: true, status, data };
    }
    return {
        ok: false,
        status,
        code: data === undefined ? 'BAD_RESPONSE' : 'HTTP',
        data,
        error: errorMessage(data, `Error del panel (${status}).`),
    };
}
