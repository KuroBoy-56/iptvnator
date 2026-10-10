import {
    isTenantCode,
    PANEL_APP_ID,
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

const ACTIONS: readonly PanelLoginAction[] = ['check_mac', 'fetch_dns', 'submit_url', 'auto_demo', 'tenant_config'];
/** Actions whose 200 answer is encrypted with the master key. */
const ENCRYPTED_REPLY: readonly PanelLoginAction[] = ['fetch_dns', 'tenant_config'];

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
 * the AES-GCM encrypted JSON with the device id as mac_address (plus
 * tenant + app when a distributor is chosen). fetch_dns and tenant_config
 * answer with an encrypted body; the rest (and every error) with JSON.
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
    const tenant = payload?.tenant?.trim() ?? '';
    if (tenant && !isTenantCode(tenant)) {
        return { ok: false, status: 0, code: 'BAD_RESPONSE', error: 'Número de distribuidor no válido' };
    }
    if (action === 'tenant_config' && !tenant) {
        return { ok: false, status: 0, code: 'BAD_RESPONSE', error: 'Número de distribuidor no válido' };
    }
    const plain = JSON.stringify(
        action === 'tenant_config'
            ? { code: tenant, app: PANEL_APP_ID, device: deps.deviceId }
            : {
                  mac_address: deps.deviceId,
                  username: payload?.username?.trim() || undefined,
                  password: payload?.password?.trim() || undefined,
                  url: payload?.url?.trim() || undefined,
                  // without a distributor ("Omitir") both stay out of the payload
                  tenant: tenant || undefined,
                  app: tenant ? PANEL_APP_ID : undefined,
              }
    );
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

    if (ENCRYPTED_REPLY.includes(action) && status === 200) {
        const decrypted = decryptPayload(text, deps.masterKey);
        const value = decrypted ? parseJson(decrypted) : undefined;
        if (action === 'fetch_dns' && Array.isArray(value)) {
            return { ok: true, status, data: value.filter((u) => typeof u === 'string') };
        }
        if (action === 'tenant_config' && value && typeof value === 'object' && !Array.isArray(value)) {
            return { ok: true, status, data: value };
        }
        return { ok: false, status, code: 'BAD_RESPONSE', error: 'Respuesta del panel no válida.' };
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
