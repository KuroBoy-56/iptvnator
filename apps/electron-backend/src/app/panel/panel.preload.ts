import type { IpcRenderer } from 'electron';
import type { PanelBridgeApi } from '@iptvnator/shared/interfaces';

/** Preload half of panel.events.ts (channel names must match). */
export function createPanelBridge(ipcRenderer: IpcRenderer): PanelBridgeApi {
    return {
        panelGetDeviceId: () => ipcRenderer.invoke('PANEL_GET_DEVICE_ID'),
        panelLoginRequest: (action, payload) =>
            ipcRenderer.invoke('PANEL_LOGIN_REQUEST', action, payload),
        panelReportError: (report) => ipcRenderer.invoke('PANEL_REPORT_ERROR', report),
        getSecureDns: () => ipcRenderer.invoke('SECURE_DNS_GET'),
        setSecureDns: (mode) => ipcRenderer.invoke('SECURE_DNS_SET', mode),
        panelClearCacheAndRestart: () => ipcRenderer.invoke('PANEL_CLEAR_CACHE_RESTART'),
    };
}
