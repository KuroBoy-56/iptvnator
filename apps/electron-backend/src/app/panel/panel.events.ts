import { ipcMain, net } from 'electron';
import { PanelLoginAction, PanelLoginPayload } from '@iptvnator/shared/interfaces';
import { setDefaultHostnameResolver, systemResolveHostname } from '../events/url-safety';
import { initSmartDns, resolveHostnameSmart, withDnsFallback } from '../services/smart-dns.service';
import { getDeviceId } from './device-id';
import { panelLoginRequest } from './panel-login.service';
import { loadPanelMasterKey } from './panel-master-key';

export const PANEL_GET_DEVICE_ID = 'PANEL_GET_DEVICE_ID';
export const PANEL_LOGIN_REQUEST = 'PANEL_LOGIN_REQUEST';

/**
 * Panel login (crypto stays in the main process) and the automatic DNS
 * fallback: no user choice, a DNS-type failure retries over DoH.
 */
export default class PanelEvents {
    static bootstrapPanelEvents(): void {
        initSmartDns();
        // Line/portal requests made by the main process (axios) resolve hosts here.
        setDefaultHostnameResolver((hostname) =>
            resolveHostnameSmart(hostname, systemResolveHostname)
        );
        const masterKey = loadPanelMasterKey();

        ipcMain.handle(PANEL_GET_DEVICE_ID, () => getDeviceId());

        ipcMain.handle(
            PANEL_LOGIN_REQUEST,
            async (_event, action: PanelLoginAction, payload?: PanelLoginPayload) =>
                panelLoginRequest(action, payload, {
                    // Chromium's network stack, so the active DNS route applies.
                    fetch: (url, init) => withDnsFallback(() => net.fetch(url, init)),
                    masterKey,
                    deviceId: await getDeviceId(),
                })
        );
    }
}
