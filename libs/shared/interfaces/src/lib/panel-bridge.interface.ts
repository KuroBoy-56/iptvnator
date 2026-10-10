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

/**
 * Bridge methods for panel login and device id (Electron only). DNS is
 * automatic in the main process, so there is no DNS method.
 */
export interface PanelBridgeApi {
    panelGetDeviceId: () => Promise<string>;
    panelLoginRequest: <T = unknown>(
        action: PanelLoginAction,
        payload?: PanelLoginPayload
    ) => Promise<PanelLoginResult<T>>;
}
