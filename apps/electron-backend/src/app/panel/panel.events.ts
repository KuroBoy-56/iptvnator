import { ipcMain, net } from 'electron';
import {
    PanelLoginAction,
    PanelLoginPayload,
    SecureDnsMode,
} from '@iptvnator/shared/interfaces';
import { getDeviceId } from './device-id';
import { panelLoginRequest } from './panel-login.service';
import { loadPanelMasterKey } from './panel-master-key';
import { applySecureDns, applyStoredSecureDns, getSecureDnsMode } from './secure-dns.service';

export const PANEL_GET_DEVICE_ID = 'PANEL_GET_DEVICE_ID';
export const PANEL_LOGIN_REQUEST = 'PANEL_LOGIN_REQUEST';
export const SECURE_DNS_GET = 'SECURE_DNS_GET';
export const SECURE_DNS_SET = 'SECURE_DNS_SET';

/** Panel login (crypto stays in the main process) and secure DNS IPC. */
export default class PanelEvents {
    static bootstrapPanelEvents(): void {
        applyStoredSecureDns();
        const masterKey = loadPanelMasterKey();

        ipcMain.handle(PANEL_GET_DEVICE_ID, () => getDeviceId());

        ipcMain.handle(
            PANEL_LOGIN_REQUEST,
            async (_event, action: PanelLoginAction, payload?: PanelLoginPayload) =>
                panelLoginRequest(action, payload, {
                    // Chromium's network stack, so the secure DNS choice applies.
                    fetch: (url, init) => net.fetch(url, init),
                    masterKey,
                    deviceId: await getDeviceId(),
                })
        );

        ipcMain.handle(SECURE_DNS_GET, () => getSecureDnsMode());
        ipcMain.handle(SECURE_DNS_SET, (_event, mode: SecureDnsMode) => applySecureDns(mode));
    }
}
