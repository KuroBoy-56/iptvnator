/** Actions accepted by the panel's api/login.php. */
export type PanelLoginAction =
    | 'check_mac'
    | 'fetch_dns'
    | 'submit_url'
    | 'auto_demo'
    | 'tenant_config';

export type PanelLoginErrorCode =
    | 'NO_MASTER_KEY'
    | 'NETWORK'
    | 'BAD_RESPONSE'
    | 'HTTP';

/** Result of a panel login request made by the Electron main process. */
export interface PanelLoginResult<T = unknown> {
    ok: boolean;
    status: number;
    data?: T;
    error?: string;
    code?: PanelLoginErrorCode;
}

/** Extra fields for submit_url (the device id is added by the main process). */
export interface PanelLoginPayload {
    username?: string;
    password?: string;
    url?: string;
    /**
     * Distributor code (6 digits). For tenant_config it is the code to look
     * up; for the other actions it is sent as "tenant" with "app". Omitted
     * with "Omitir", so the request is byte-for-byte the old one.
     */
    tenant?: string;
}

export type SecureDnsMode =
    | 'automatic'
    | 'cloudflare'
    | 'google'
    | 'quad9'
    | 'adguard'
    | 'nextdns'
    | 'opendns';

export interface SecureDnsOption {
    id: SecureDnsMode;
    label: string;
    description: string;
    /** DNS-over-HTTPS template; empty for the system resolver. */
    url: string;
}

export const SECURE_DNS_OPTIONS: readonly SecureDnsOption[] = [
    { id: 'automatic', label: 'Automático', description: 'DNS del sistema', url: '' },
    { id: 'cloudflare', label: 'Cloudflare', description: 'Rápido y privado', url: 'https://cloudflare-dns.com/dns-query' },
    { id: 'google', label: 'Google', description: 'Estable', url: 'https://dns.google/dns-query' },
    { id: 'quad9', label: 'Quad9', description: 'Bloquea dominios maliciosos', url: 'https://dns.quad9.net/dns-query' },
    { id: 'adguard', label: 'AdGuard', description: 'Sin rastreo ni anuncios', url: 'https://dns.adguard-dns.com/dns-query' },
    { id: 'nextdns', label: 'NextDNS', description: 'Anti-bloqueo geográfico', url: 'https://dns.nextdns.io/dns-query' },
    { id: 'opendns', label: 'OpenDNS', description: 'Cisco OpenDNS', url: 'https://doh.opendns.com/dns-query' },
];

export function isSecureDnsMode(value: unknown): value is SecureDnsMode {
    return SECURE_DNS_OPTIONS.some((option) => option.id === value);
}

/** Bridge methods for panel login, device id and secure DNS (Electron only). */
export interface PanelBridgeApi {
    panelGetDeviceId: () => Promise<string>;
    panelLoginRequest: <T = unknown>(
        action: PanelLoginAction,
        payload?: PanelLoginPayload
    ) => Promise<PanelLoginResult<T>>;
    getSecureDns: () => Promise<SecureDnsMode>;
    setSecureDns: (mode: SecureDnsMode) => Promise<SecureDnsMode>;
}
