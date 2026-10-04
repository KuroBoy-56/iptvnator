import { app } from 'electron';
import {
    isSecureDnsMode,
    SECURE_DNS_OPTIONS,
    SecureDnsMode,
} from '@iptvnator/shared/interfaces';
import { SECURE_DNS_MODE, store } from '../services/store.service';

type HostResolverOptions = Parameters<typeof app.configureHostResolver>[0];

/** Electron resolver settings for a DNS choice. */
export function hostResolverOptions(mode: SecureDnsMode): HostResolverOptions {
    const option = SECURE_DNS_OPTIONS.find((o) => o.id === mode);
    if (!option?.url) {
        return { secureDnsMode: 'automatic', secureDnsServers: [] };
    }
    return { secureDnsMode: 'secure', secureDnsServers: [option.url] };
}

export function getSecureDnsMode(): SecureDnsMode {
    const stored = store.get(SECURE_DNS_MODE, 'automatic');
    return isSecureDnsMode(stored) ? stored : 'automatic';
}

/**
 * Applies DNS-over-HTTPS to Chromium's resolver, which serves the renderer,
 * the built-in players and requests made with electron's net module.
 * External players (MPV/VLC) are separate processes and keep the OS resolver.
 */
export function applySecureDns(mode: SecureDnsMode): SecureDnsMode {
    const safe = isSecureDnsMode(mode) ? mode : 'automatic';
    try {
        app.configureHostResolver(hostResolverOptions(safe));
    } catch {
        // Only valid after app ready; callers apply again once ready.
    }
    store.set(SECURE_DNS_MODE, safe);
    return safe;
}

export function applyStoredSecureDns(): void {
    applySecureDns(getSecureDnsMode());
}
