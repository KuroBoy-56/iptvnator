import {
    normalizeXtreamServerUrl,
    PanelBridgeApi,
    readTenantCode,
} from '@iptvnator/shared/interfaces';

/**
 * DNS list of the current panel (api/login.php, action fetch_dns), requested
 * through the Electron main process like the login screen does. Empty in the
 * PWA or when the panel cannot be reached.
 */
export async function panelDnsServers(): Promise<string[]> {
    const bridge = (window as unknown as { electron?: Partial<PanelBridgeApi> })
        .electron;
    if (typeof bridge?.panelLoginRequest !== 'function') return [];
    try {
        // the chosen distributor's DNS list (the owner's with "Omitir")
        const tenant = readTenantCode();
        const res = tenant
            ? await bridge.panelLoginRequest<unknown>('fetch_dns', { tenant })
            : await bridge.panelLoginRequest<unknown>('fetch_dns');
        const list = res.ok && Array.isArray(res.data) ? res.data : [];
        const servers = new Set<string>();
        for (const entry of list) {
            if (typeof entry !== 'string' || !entry.trim()) continue;
            try {
                servers.add(normalizeXtreamServerUrl(entry));
            } catch {
                // not an http(s) server: skip it
            }
        }
        return [...servers];
    } catch {
        return [];
    }
}
