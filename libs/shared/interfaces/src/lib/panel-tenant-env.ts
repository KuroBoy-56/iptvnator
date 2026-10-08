/**
 * Browser globals typed locally: this library is also compiled for Node
 * (web-backend), where the DOM lib is not available.
 */
export interface TenantKvStorage {
    readonly length: number;
    key(index: number): string | null;
    getItem(key: string): string | null;
    setItem(key: string, value: string): void;
    removeItem(key: string): void;
}

export interface TenantStyleNode {
    id: string;
    textContent: string | null;
    remove(): void;
}

export interface TenantDocument {
    getElementById(id: string): unknown;
    createElement(tag: 'style'): unknown;
    head: { appendChild(node: unknown): unknown };
}

interface TenantGlobals {
    localStorage?: TenantKvStorage;
    document?: TenantDocument;
    dispatchEvent?: (event: unknown) => boolean;
    Event?: new (type: string) => unknown;
    CustomEvent?: new (type: string, init?: { detail?: unknown }) => unknown;
}

export function tenantGlobals(): TenantGlobals {
    return globalThis as unknown as TenantGlobals;
}

/** Throws when there is no storage; every caller wraps it in try/catch. */
export function tenantStorage(): TenantKvStorage {
    const storage = tenantGlobals().localStorage;
    if (!storage) throw new Error('localStorage unavailable');
    return storage;
}

export function dispatchTenantEvent(type: string, detail?: unknown): void {
    const g = tenantGlobals();
    if (!g.dispatchEvent) return;
    if (detail !== undefined && g.CustomEvent) g.dispatchEvent(new g.CustomEvent(type, { detail }));
    else if (g.Event) g.dispatchEvent(new g.Event(type));
}
