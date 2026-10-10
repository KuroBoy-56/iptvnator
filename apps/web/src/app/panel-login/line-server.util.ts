import type { PortalStatus } from '@iptvnator/services';

export type LineServerCheck = (server: string) => Promise<PortalStatus>;

/** Longest wait for the probes before falling back to the best answer so far. */
export const LINE_SERVER_PROBE_TIMEOUT_MS = 12_000;

/**
 * Picks the panel DNS (fetch_dns) that serves the typed user and password,
 * so the login screen needs no server selector. Every server is probed in
 * parallel with the line's credentials: the first `active` one wins, then an
 * `expired` one (the account exists there), otherwise the first server.
 */
export function pickLineServer(
    servers: readonly string[],
    check: LineServerCheck,
    timeoutMs = LINE_SERVER_PROBE_TIMEOUT_MS
): Promise<string | null> {
    if (servers.length <= 1) return Promise.resolve(servers[0] ?? null);

    return new Promise((resolve) => {
        const statuses: (PortalStatus | undefined)[] = servers.map(() => undefined);
        let pending = servers.length;
        let done = false;

        const finish = (server: string): void => {
            if (done) return;
            done = true;
            clearTimeout(timer);
            resolve(server);
        };
        const best = (): string => {
            const expired = statuses.indexOf('expired');
            return expired >= 0 ? servers[expired] : servers[0];
        };
        const timer = setTimeout(() => finish(best()), timeoutMs);

        servers.forEach((server, index) => {
            check(server)
                .catch((): PortalStatus => 'unavailable')
                .then((status) => {
                    statuses[index] = status;
                    pending -= 1;
                    if (status === 'active') finish(server);
                    else if (pending === 0) finish(best());
                });
        });
    });
}
