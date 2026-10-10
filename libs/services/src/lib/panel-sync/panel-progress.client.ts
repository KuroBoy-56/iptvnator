import {
    notifyTenantError,
    PANEL_APP_ID,
    PANEL_TENANT_FATAL,
    panelEndpoint,
    panelTenantFields,
    tenantErrorCode,
    tenantStorageSuffix,
} from '@iptvnator/shared/interfaces';
import { PanelSnapshot, SyncUserCredentials } from './panel-sync.types';
import { rememberPanelTmdbKey } from './panel-tmdb-key';

// v2: tokens carry the line's server, so progress and favorites are kept per user + DNS.
const TOKEN_PREFIX = 'panel_sync_token2:';
const SNAPSHOT_TTL_MS = 15_000;

type FetchFn = typeof fetch;

/** Cache key for a line: the same username on two servers is two different accounts. */
export function lineKey(creds: SyncUserCredentials): string {
    const user = creds.username?.trim();
    if (!user) return '';
    // scheme-insensitive: the same line may be reached over http or https
    const server = (creds.server ?? '')
        .trim()
        .replace(/^https?:\/\//i, '')
        .replace(/\/+$/, '')
        .toLowerCase();
    return server ? `${user}@${server}` : user;
}

/**
 * Token cache key: the line plus the distributor code, so switching
 * distributor never reuses another one's token ('' suffix with Omitir).
 */
export function tokenKey(creds: SyncUserCredentials): string {
    const line = lineKey(creds);
    return line ? line + tenantStorageSuffix() : '';
}

/** A panel 401/403 caused by the distributor (expired, suspended…) goes to the guardian. */
async function reportTenantError(res: Response): Promise<void> {
    if (res.status !== 401 && res.status !== 403 && res.status !== 404) return;
    const body = await res.clone().json().catch(() => null);
    const code = tenantErrorCode(body);
    if (code && PANEL_TENANT_FATAL.includes(code)) notifyTenantError(code);
}

function readToken(user: string): string | null {
    try {
        return localStorage.getItem(TOKEN_PREFIX + user);
    } catch {
        return null;
    }
}

function writeToken(user: string, token: string | null): void {
    try {
        if (token) localStorage.setItem(TOKEN_PREFIX + user, token);
        else localStorage.removeItem(TOKEN_PREFIX + user);
    } catch {
        // Storage can be unavailable (private mode); the token stays in memory.
    }
}

/**
 * Talks to the panel API (progress.php, epg.php). The Xtream password is sent only once (action
 * "auth"); afterwards only the signed token is kept and reused.
 */
export class PanelProgressClient {
    private readonly tokens = new Map<string, string>();
    private readonly snapshots = new Map<string, { at: number; data: PanelSnapshot }>();
    private readonly inflight = new Map<string, Promise<PanelSnapshot | null>>();

    constructor(private readonly fetchFn: FetchFn = (...args) => fetch(...args)) {}

    private get url(): string {
        return panelEndpoint('progress.php');
    }

    private async authenticate(creds: SyncUserCredentials): Promise<string | null> {
        const user = creds.username?.trim();
        const pass = creds.password?.trim();
        if (!user || !pass) return null;
        const res = await this.fetchFn(this.url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'auth', user, pass, dns: creds.server?.trim() ?? '', ...panelTenantFields(), platform: PANEL_APP_ID }),
        });
        if (!res.ok) await reportTenantError(res);
        const body = res.ok ? await res.json().catch(() => null) : null;
        const token = body?.success && typeof body.token === 'string' ? body.token : null;
        rememberPanelTmdbKey(body?.tmdbKey);
        if (token) {
            this.tokens.set(tokenKey(creds), token);
            writeToken(tokenKey(creds), token);
        }
        return token;
    }

    private async token(creds: SyncUserCredentials, refresh = false): Promise<string | null> {
        const key = tokenKey(creds);
        if (!key) return null;
        if (!refresh) {
            const known = this.tokens.get(key) ?? readToken(key);
            if (known) return known;
        }
        return this.authenticate(creds);
    }

    /** Runs a request with the token, re-authenticating once on 401. */
    private async withToken(
        creds: SyncUserCredentials,
        send: (token: string) => Promise<Response>
    ): Promise<Response | null> {
        let token = await this.token(creds);
        if (!token) return null;
        let res = await send(token);
        // 403 = the token's distributor is no longer valid: one re-auth, then the guardian decides
        if (res.status === 401 || (res.status === 403 && panelTenantFields().tenant)) {
            const key = tokenKey(creds);
            this.tokens.delete(key);
            writeToken(key, null);
            token = await this.token(creds, true);
            if (!token) return null;
            res = await send(token);
            if (!res.ok) await reportTenantError(res);
        }
        return res;
    }

    async getSnapshot(creds: SyncUserCredentials, force = false): Promise<PanelSnapshot | null> {
        const user = lineKey(creds);
        if (!user) return null;
        const cached = this.snapshots.get(user);
        if (!force && cached && Date.now() - cached.at < SNAPSHOT_TTL_MS) {
            return cached.data;
        }
        const pending = this.inflight.get(user);
        if (pending) return pending;

        const request = this.withToken(creds, (token) =>
            this.fetchFn(`${this.url}?v=2`, {
                headers: { Authorization: `Bearer ${token}` },
            })
        )
            .then(async (res) => {
                if (!res?.ok) return null;
                const body = await res.json().catch(() => null);
                rememberPanelTmdbKey(body?.tmdbKey);
                const data: PanelSnapshot = {
                    progress: body?.progress && typeof body.progress === 'object' ? body.progress : {},
                    favorites: Array.isArray(body?.favorites) ? body.favorites : [],
                };
                this.snapshots.set(user, { at: Date.now(), data });
                return data;
            })
            .catch(() => null)
            .finally(() => this.inflight.delete(user));
        this.inflight.set(user, request);
        return request;
    }

    /** Cached snapshot without a network round-trip (may be stale or null). */
    peekSnapshot(creds: SyncUserCredentials): PanelSnapshot | null {
        const user = lineKey(creds);
        return user ? this.snapshots.get(user)?.data ?? null : null;
    }

    /** Applies a local change to the cached snapshot so reads stay coherent. */
    patchSnapshot(creds: SyncUserCredentials, patch: (data: PanelSnapshot) => void): void {
        const user = lineKey(creds);
        const cached = user ? this.snapshots.get(user) : undefined;
        if (cached) patch(cached.data);
    }

    /** POSTs JSON with the token to another panel endpoint (e.g. epg.php). */
    async postJson<T>(
        file: string,
        creds: SyncUserCredentials,
        body: Record<string, unknown>
    ): Promise<T | null> {
        try {
            const res = await this.withToken(creds, (token) =>
                this.fetchFn(panelEndpoint(file), {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ ...body, token }),
                })
            );
            return res?.ok ? ((await res.json().catch(() => null)) as T | null) : null;
        } catch {
            return null;
        }
    }

    async post(creds: SyncUserCredentials, body: Record<string, unknown>): Promise<boolean> {
        try {
            const res = await this.withToken(creds, (token) =>
                this.fetchFn(this.url, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ ...body, token }),
                })
            );
            return !!res?.ok;
        } catch {
            return false;
        }
    }
}
