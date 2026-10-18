import { app, session } from 'electron';
import { isSecureDnsMode, SECURE_DNS_OPTIONS, SecureDnsMode } from '@iptvnator/shared/interfaces';
import { isDnsResolutionFailure, shouldTryAnotherDnsRoute } from './dns-failure';
import { DNS_ROUTE, LEGACY_SECURE_DNS_MODE, store } from './store.service';

/**
 * DNS button «Automático» (default): requests start with the system resolver;
 * when a panel or line request fails with a DNS-type error the main process
 * switches Chromium's resolver to DNS-over-HTTPS (Cloudflare, then Google),
 * retries, and keeps the route that worked, also for the next start.
 * Any other choice of the button always uses that DNS-over-HTTPS server.
 */
export type DnsRoute = 'system' | Exclude<SecureDnsMode, 'automatic'>;

/** Order in which routes are tried after a DNS-type failure. */
export const DNS_ROUTES: readonly DnsRoute[] = ['system', 'cloudflare', 'google'];

function dohServer(route: Exclude<DnsRoute, 'system'>): string {
    return SECURE_DNS_OPTIONS.find((o) => o.id === route)?.url ?? '';
}

type HostResolverOptions = Parameters<typeof app.configureHostResolver>[0];
export type SystemHostnameResolver = (hostname: string) => Promise<readonly string[]>;

let activeRoute: DnsRoute = 'system';
/** A provider chosen with the DNS button: no automatic switching. */
let fixedRoute = false;
let queue: Promise<unknown> = Promise.resolve();

export function isDnsRoute(value: unknown): value is DnsRoute {
    return DNS_ROUTES.includes(value as DnsRoute);
}

/** Electron resolver settings for a route. */
export function hostResolverOptions(route: DnsRoute): HostResolverOptions {
    return route === 'system'
        ? { secureDnsMode: 'automatic', secureDnsServers: [] }
        : { secureDnsMode: 'secure', secureDnsServers: [dohServer(route)] };
}

export function getActiveDnsRoute(): DnsRoute {
    return activeRoute;
}

/**
 * Points Chromium's resolver (renderer, net.fetch, built-in player,
 * session.resolveHost) at a route. External MPV/VLC keep the OS resolver.
 */
async function applyRoute(route: DnsRoute): Promise<void> {
    activeRoute = route;
    try {
        app.configureHostResolver(hostResolverOptions(route));
    } catch {
        // Only valid after app ready; initSmartDns runs after ready.
    }
    try {
        await session.defaultSession?.clearHostResolverCache();
    } catch {
        // Cache clearing is best effort.
    }
}

/** Choice of the DNS button ('automatic' unless the user picked a provider). */
export function getDnsChoice(): SecureDnsMode {
    const stored = store.get(LEGACY_SECURE_DNS_MODE, 'automatic');
    return isSecureDnsMode(stored) ? stored : 'automatic';
}

function storedAutoRoute(): DnsRoute {
    const stored = store.get(DNS_ROUTE, 'system');
    return isDnsRoute(stored) ? stored : 'system';
}

/** DNS button: a provider is used from now on; «Automático» goes back to the fallback. */
export async function setDnsChoice(mode: SecureDnsMode): Promise<SecureDnsMode> {
    const choice = isSecureDnsMode(mode) ? mode : 'automatic';
    store.set(LEGACY_SECURE_DNS_MODE, choice);
    fixedRoute = choice !== 'automatic';
    await applyRoute(choice === 'automatic' ? storedAutoRoute() : choice);
    return choice;
}

/** Startup: the provider of the DNS button, or the automatic route that last worked. */
export function initSmartDns(): DnsRoute {
    const choice = getDnsChoice();
    fixedRoute = choice !== 'automatic';
    const route = choice === 'automatic' ? storedAutoRoute() : choice;
    void applyRoute(route);
    return route;
}

/** Runs route switches one at a time so parallel failures do not race. */
function exclusive<T>(job: () => Promise<T>): Promise<T> {
    const run = queue.then(job, job);
    queue = run.catch(() => undefined);
    return run;
}

async function retryOnOtherRoutes<T>(
    task: () => Promise<T>,
    firstError: unknown,
    failedRoute: DnsRoute
): Promise<T> {
    const original = activeRoute;
    // A parallel request may already have switched to a working route: try it first.
    const candidates = [original, ...DNS_ROUTES].filter(
        (route, index, all) => route !== failedRoute && all.indexOf(route) === index
    );
    for (const route of candidates) {
        if (route !== activeRoute) await applyRoute(route);
        try {
            const result = await task();
            store.set(DNS_ROUTE, route);
            return result;
        } catch (error) {
            if (!shouldTryAnotherDnsRoute(error)) {
                if (activeRoute !== original) await applyRoute(original);
                throw error;
            }
        }
    }
    if (activeRoute !== original) await applyRoute(original);
    throw firstError;
}

/**
 * Runs a request; on a DNS-type failure retries it on the other routes and
 * keeps the first one that works. Other errors are passed through untouched.
 */
export async function withDnsFallback<T>(task: () => Promise<T>): Promise<T> {
    if (fixedRoute) return task();
    const routeAtStart = activeRoute;
    try {
        return await task();
    } catch (error) {
        if (!shouldTryAnotherDnsRoute(error)) throw error;
        return exclusive(() => retryOnOtherRoutes(task, error, routeAtStart));
    }
}

/** Resolves through Chromium, so the active (possibly DoH) route applies. */
async function chromiumResolve(hostname: string): Promise<readonly string[]> {
    const resolved = await session.defaultSession.resolveHost(hostname);
    const addresses = resolved.endpoints.map((e) => e.address).filter(Boolean);
    if (!addresses.length) throw new Error('net::ERR_NAME_NOT_RESOLVED');
    return addresses;
}

/**
 * Host lookup for main-process requests (Xtream/Stalker/playlist via axios,
 * which pins the validated addresses). On the system route Node's resolver
 * is used first; a DNS failure there, or a DoH route already in use, goes
 * through Chromium with the automatic fallback.
 */
export async function resolveHostnameSmart(
    hostname: string,
    systemResolve: SystemHostnameResolver
): Promise<readonly string[]> {
    if (activeRoute === 'system') {
        try {
            return await systemResolve(hostname);
        } catch (error) {
            if (!isDnsResolutionFailure(error)) throw error;
        }
    }
    return withDnsFallback(() => chromiumResolve(hostname));
}

/** Test helper. */
export function resetSmartDnsForTests(): void {
    activeRoute = 'system';
    fixedRoute = false;
    queue = Promise.resolve();
}
