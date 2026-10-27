/** Actions accepted by the panel's api/login.php. */
export type PanelLoginAction =
    | 'check_mac'
    | 'fetch_dns'
    | 'submit_url'
    | 'auto_demo'
    | 'tenant_config'
    /** Lo que ofrece el login (botón Autodemo): respuesta JSON sin cifrar. */
    | 'features';

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
    /**
     * Reseller demo code typed in the password box (auto_demo only): the demo
     * is registered under that reseller. Sent only when it looks like one
     * (see isResellerCode).
     */
    reseller?: string;
    /** App language (es/en/pt/fr): the panel answers its texts in it. Sent with every action. */
    lang?: string;
    /** check_mac: última orden «borrar caché» del panel que esta app ya aplicó (0 = ninguna). */
    cc?: number;
    /** check_mac: re-check of the open app (every 10 min), not another start for the panel's statistics. */
    poll?: number;
}

/** One error for the panel («Errores de las apps»): see api/report.php. */
export interface PanelErrorReport {
    kind: 'crash' | 'error' | 'playback' | 'network' | 'panel' | 'warning';
    message: string;
    detail?: string;
    screen?: string;
    user?: string;
    server?: string;
    tenant?: string;
    /** App language (es/en/pt/fr) */
    lang?: string;
}

/**
 * DNS button (as in the Android, iOS and TV apps). 'automatic' = system
 * resolver with the automatic DNS-over-HTTPS fallback; any other = always that
 * DNS-over-HTTPS server. Applied in the Electron main process.
 */
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
    /** i18n key of the short description. */
    descriptionKey: string;
    /** DNS-over-HTTPS template; empty for the automatic mode. */
    url: string;
}

export const SECURE_DNS_OPTIONS: readonly SecureDnsOption[] = [
    { id: 'automatic', label: 'Automático', descriptionKey: 'MPX.DNS.AUTOMATIC', url: '' },
    { id: 'cloudflare', label: 'Cloudflare', descriptionKey: 'MPX.DNS.CLOUDFLARE', url: 'https://cloudflare-dns.com/dns-query' },
    { id: 'google', label: 'Google', descriptionKey: 'MPX.DNS.GOOGLE', url: 'https://dns.google/dns-query' },
    { id: 'quad9', label: 'Quad9', descriptionKey: 'MPX.DNS.QUAD9', url: 'https://dns.quad9.net/dns-query' },
    { id: 'adguard', label: 'AdGuard', descriptionKey: 'MPX.DNS.ADGUARD', url: 'https://dns.adguard-dns.com/dns-query' },
    { id: 'nextdns', label: 'NextDNS', descriptionKey: 'MPX.DNS.NEXTDNS', url: 'https://dns.nextdns.io/dns-query' },
    { id: 'opendns', label: 'OpenDNS', descriptionKey: 'MPX.DNS.OPENDNS', url: 'https://doh.opendns.com/dns-query' },
];

export function isSecureDnsMode(value: unknown): value is SecureDnsMode {
    return SECURE_DNS_OPTIONS.some((option) => option.id === value);
}

/**
 * Bridge methods for panel login, device id, the DNS button and the remote
 * cache clear (Electron only).
 */
export interface PanelBridgeApi {
    panelGetDeviceId: () => Promise<string>;
    /** DNS button: current choice / change it (applied at once in the main process). */
    getSecureDns?: () => Promise<SecureDnsMode>;
    setSecureDns?: (mode: SecureDnsMode) => Promise<SecureDnsMode>;
    /** Sends an error to the panel (encrypted in the main process). */
    panelReportError?: (report: PanelErrorReport) => Promise<boolean>;
    /** Orden «borrar caché» del panel: borra la caché re-descargable y reinicia la app. */
    panelClearCacheAndRestart?: () => Promise<void>;
    panelLoginRequest: <T = unknown>(
        action: PanelLoginAction,
        payload?: PanelLoginPayload
    ) => Promise<PanelLoginResult<T>>;
}
