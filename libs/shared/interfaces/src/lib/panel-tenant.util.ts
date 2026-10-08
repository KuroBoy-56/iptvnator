/**
 * Distributor ("tenant") of the panel, chosen once on the first launch.
 *
 * - choice "none": nothing chosen yet → the login shows the distributor step.
 * - choice "skip" ("Omitir"): exactly the old behaviour, no tenant field is
 *   ever sent to the panel.
 * - choice "code": every panel call carries `tenant` + `app`, and the
 *   branding (name, logo, palette) comes from api/login.php tenant_config.
 */

/** App id this build sends to the panel. */
export const PANEL_APP_ID = 'windows';

export type PanelTenantChoice = 'none' | 'skip' | 'code';

export interface PanelTenantPalette {
    accent: string;
    bg: string;
    surface: string;
    text: string;
}

export interface PanelTenantFeatures {
    demo: boolean;
    alerts: boolean;
    sports: boolean;
}

/** Cached tenant_config answer (all the app needs between launches). */
export interface PanelTenantCache {
    code: string;
    name: string | null;
    logoUrl: string | null;
    logoRev: number;
    palette: PanelTenantPalette | null;
    /** UTC epoch seconds; 0 = never expires. */
    expiresAt: number;
    /** YYYY-MM-DD (Panama time) or null. */
    expiresDate: string | null;
    features: PanelTenantFeatures;
    rev: number;
    /** Seconds between background checks. */
    recheckAfter: number;
    /** Epoch ms of the last successful tenant_config. */
    lastOkCheck: number;
}

export type PanelTenantErrorCode =
    | 'tenant_invalid'
    | 'tenant_expired'
    | 'tenant_suspended'
    | 'app_not_linked'
    | 'app_required'
    | 'too_many_attempts';

export const PANEL_TENANT_MESSAGES: Record<PanelTenantErrorCode, string> = {
    tenant_invalid: 'Número de distribuidor no válido',
    tenant_expired: 'El servicio de este distribuidor venció. Contacta a tu distribuidor.',
    tenant_suspended: 'Este distribuidor está suspendido. Contacta a tu distribuidor.',
    app_not_linked: 'Este número de distribuidor no está habilitado para esta aplicación.',
    app_required: 'Error de la aplicación: falta indicar la app al panel. Actualiza la aplicación.',
    too_many_attempts: 'Demasiados intentos. Espera 15 minutos e inténtalo de nuevo.',
};

/** Errors that end the distributor on this device (code + branding + session wiped). */
export const PANEL_TENANT_FATAL: readonly PanelTenantErrorCode[] = [
    'tenant_invalid',
    'tenant_expired',
    'tenant_suspended',
    'app_not_linked',
];

export const PANEL_TENANT_KEYS = {
    choice: 'panel_dist_choice',
    code: 'panel_dist_code',
    cache: 'panel_dist_cache',
    themeCss: 'panel_dist_theme_css',
} as const;

/** Fired on window when the choice or the branding changes. */
export const PANEL_TENANT_CHANGED_EVENT = 'panel-tenant-changed';
/** Fired on window (detail = error code) when a panel API rejects the tenant. */
export const PANEL_TENANT_ERROR_EVENT = 'panel-tenant-error';

export const DEFAULT_TENANT_RECHECK_SECONDS = 21600;
const CODE_RE = /^\d{6}$/;
const HEX_RE = /^#[0-9A-F]{6}$/;
const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const PANAMA_OFFSET_MS = -5 * 3600 * 1000;

export function isTenantCode(value: unknown): value is string {
    return typeof value === 'string' && CODE_RE.test(value);
}

export function isTenantErrorCode(value: unknown): value is PanelTenantErrorCode {
    return typeof value === 'string' && value in PANEL_TENANT_MESSAGES;
}

/** Tenant error code of a plain JSON panel error body, else null. */
export function tenantErrorCode(body: unknown): PanelTenantErrorCode | null {
    const code = (body as { code?: unknown } | null | undefined)?.code;
    return isTenantErrorCode(code) ? code : null;
}

function get(key: string): string | null {
    try {
        return localStorage.getItem(key);
    } catch {
        return null;
    }
}

function set(key: string, value: string | null): void {
    try {
        if (value === null) localStorage.removeItem(key);
        else localStorage.setItem(key, value);
    } catch {
        // Storage unavailable: the choice lasts for this run only.
    }
}

function changed(): void {
    globalThis.dispatchEvent?.(new Event(PANEL_TENANT_CHANGED_EVENT));
}

export function readTenantChoice(): PanelTenantChoice {
    const choice = get(PANEL_TENANT_KEYS.choice);
    if (choice === 'skip') return 'skip';
    if (choice === 'code' && isTenantCode(get(PANEL_TENANT_KEYS.code))) return 'code';
    return 'none';
}

/** The chosen distributor code, '' for none/Omitir. */
export function readTenantCode(): string {
    return readTenantChoice() === 'code' ? (get(PANEL_TENANT_KEYS.code) ?? '') : '';
}

/** `{tenant, app}` to add to panel payloads; empty with Omitir (old behaviour). */
export function panelTenantFields(): { tenant?: string; app?: string } {
    const code = readTenantCode();
    return code ? { tenant: code, app: PANEL_APP_ID } : {};
}

/** Appends ?t=<code>&app=<app> to a panel URL (unchanged with Omitir). */
export function withTenantQuery(url: string): string {
    const code = readTenantCode();
    if (!code) return url;
    const sep = url.includes('?') ? '&' : '?';
    return `${url}${sep}t=${encodeURIComponent(code)}&app=${PANEL_APP_ID}`;
}

/** Storage-key suffix so caches of two distributors never mix ('' with Omitir). */
export function tenantStorageSuffix(): string {
    const code = readTenantCode();
    return code ? `@t${code}` : '';
}

export function readTenantCache(): PanelTenantCache | null {
    const code = readTenantCode();
    if (!code) return null;
    try {
        const cache = JSON.parse(get(PANEL_TENANT_KEYS.cache) ?? 'null') as PanelTenantCache | null;
        return cache && cache.code === code ? cache : null;
    } catch {
        return null;
    }
}

/** Features of the chosen distributor; everything on with Omitir. */
export function readTenantFeatures(): PanelTenantFeatures {
    return readTenantCache()?.features ?? { demo: true, alerts: true, sports: true };
}

export function saveTenantCode(cache: PanelTenantCache): void {
    set(PANEL_TENANT_KEYS.choice, 'code');
    set(PANEL_TENANT_KEYS.code, cache.code);
    set(PANEL_TENANT_KEYS.cache, JSON.stringify(cache));
    changed();
}

export function saveTenantSkip(): void {
    set(PANEL_TENANT_KEYS.choice, 'skip');
    set(PANEL_TENANT_KEYS.code, null);
    set(PANEL_TENANT_KEYS.cache, null);
    set(PANEL_TENANT_KEYS.themeCss, null);
    changed();
}

/** Forgets the choice, the code and the branding (the distributor step shows again). */
export function clearTenant(): void {
    set(PANEL_TENANT_KEYS.choice, null);
    set(PANEL_TENANT_KEYS.code, null);
    set(PANEL_TENANT_KEYS.cache, null);
    set(PANEL_TENANT_KEYS.themeCss, null);
    changed();
}

/** Reports a tenant error answered by progress/epg/sports (the guardian handles it). */
export function notifyTenantError(code: PanelTenantErrorCode): void {
    globalThis.dispatchEvent?.(new CustomEvent(PANEL_TENANT_ERROR_EVENT, { detail: code }));
}

function bool(value: unknown, fallback: boolean): boolean {
    return typeof value === 'boolean' ? value : fallback;
}

function num(value: unknown): number {
    const n = Number(value);
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

function palette(value: unknown): PanelTenantPalette | null {
    if (!value || typeof value !== 'object') return null;
    const p = value as Record<string, unknown>;
    const out: Record<string, string> = {};
    for (const key of ['accent', 'bg', 'surface', 'text']) {
        const hex = String(p[key] ?? '').toUpperCase();
        if (!HEX_RE.test(hex)) return null;
        out[key] = hex;
    }
    return out as unknown as PanelTenantPalette;
}

/** Validates a decrypted tenant_config answer; null when it is not one. */
export function parseTenantConfig(raw: unknown, now = Date.now()): PanelTenantCache | null {
    const body = raw as Record<string, unknown> | null;
    const t = body?.['tenant'] as Record<string, unknown> | undefined;
    if (!body || body['status'] !== 'ok' || !t || !isTenantCode(String(t['code'] ?? ''))) return null;
    const f = (body['features'] ?? {}) as Record<string, unknown>;
    const name = typeof t['name'] === 'string' && t['name'].trim() ? t['name'].trim() : null;
    const logo = typeof t['logo_url'] === 'string' && /^https?:\/\//i.test(t['logo_url']) ? t['logo_url'] : null;
    const date = typeof t['expires_date'] === 'string' && DATE_RE.test(t['expires_date']) ? t['expires_date'] : null;
    return {
        code: String(t['code']),
        name,
        logoUrl: logo,
        logoRev: num(t['logo_rev']),
        palette: palette(t['palette']),
        expiresAt: num(t['expires_at']),
        expiresDate: date,
        features: { demo: bool(f['demo'], true), alerts: bool(f['alerts'], true), sports: bool(f['sports'], true) },
        rev: num(t['rev']),
        recheckAfter: num(body['recheck_after']) || DEFAULT_TENANT_RECHECK_SECONDS,
        lastOkCheck: now,
    };
}

/** expires_at is UTC epoch seconds; 0 never expires. */
export function isTenantExpired(cache: Pick<PanelTenantCache, 'expiresAt'>, now = Date.now()): boolean {
    return cache.expiresAt > 0 && now > cache.expiresAt * 1000;
}

/** DD/MM/AAAA of the expiry in Panama time (UTC−5, no DST); '' when it never expires. */
export function formatTenantExpiry(cache: Pick<PanelTenantCache, 'expiresAt' | 'expiresDate'>): string {
    const m = cache.expiresDate ? DATE_RE.exec(cache.expiresDate) : null;
    if (m) return `${m[3]}/${m[2]}/${m[1]}`;
    if (!cache.expiresAt) return '';
    const d = new Date(cache.expiresAt * 1000 + PANAMA_OFFSET_MS);
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${pad(d.getUTCDate())}/${pad(d.getUTCMonth() + 1)}/${d.getUTCFullYear()}`;
}

export function tenantExpiredMessage(cache: Pick<PanelTenantCache, 'expiresAt' | 'expiresDate'>): string {
    const date = formatTenantExpiry(cache);
    return date ? `Tu distribuidor venció el ${date} (hora de Panamá)` : PANEL_TENANT_MESSAGES.tenant_expired;
}

/** Removes every per-distributor cache (panel token, TMDB key…) stored for a code. */
export function forgetTenantStorage(code: string): void {
    if (!isTenantCode(code)) return;
    try {
        const suffix = `@t${code}`;
        const keys: string[] = [];
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key?.includes(suffix)) keys.push(key);
        }
        keys.forEach((key) => localStorage.removeItem(key));
    } catch {
        // Storage unavailable: nothing was cached.
    }
}
