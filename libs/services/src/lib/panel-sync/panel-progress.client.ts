import { panelEndpoint } from './panel-endpoint';
import { PanelSnapshot, SyncUserCredentials } from './panel-sync.types';

const TOKEN_PREFIX = 'panel_sync_token:';
const SNAPSHOT_TTL_MS = 15_000;

type FetchFn = typeof fetch;

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
 * Talks to api/progress.php. The Xtream password is sent only once (action
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
            body: JSON.stringify({ action: 'auth', user, pass }),
        });
        const body = res.ok ? await res.json().catch(() => null) : null;
        const token = body?.success && typeof body.token === 'string' ? body.token : null;
        if (token) {
            this.tokens.set(user, token);
            writeToken(user, token);
        }
        return token;
    }

    private async token(creds: SyncUserCredentials, refresh = false): Promise<string | null> {
        const user = creds.username?.trim();
        if (!user) return null;
        if (!refresh) {
            const known = this.tokens.get(user) ?? readToken(user);
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
        if (res.status === 401) {
            const user = creds.username?.trim() ?? '';
            this.tokens.delete(user);
            writeToken(user, null);
            token = await this.token(creds, true);
            if (!token) return null;
            res = await send(token);
        }
        return res;
    }

    async getSnapshot(creds: SyncUserCredentials, force = false): Promise<PanelSnapshot | null> {
        const user = creds.username?.trim();
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
        const user = creds.username?.trim();
        return user ? this.snapshots.get(user)?.data ?? null : null;
    }

    /** Applies a local change to the cached snapshot so reads stay coherent. */
    patchSnapshot(creds: SyncUserCredentials, patch: (data: PanelSnapshot) => void): void {
        const user = creds.username?.trim();
        const cached = user ? this.snapshots.get(user) : undefined;
        if (cached) patch(cached.data);
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
