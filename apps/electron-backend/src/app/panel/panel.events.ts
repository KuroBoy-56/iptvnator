import { app, ipcMain, net } from 'electron';
import { PanelErrorReport, PanelLoginAction, PanelLoginPayload } from '@iptvnator/shared/interfaces';
import { setDefaultHostnameResolver, systemResolveHostname } from '../events/url-safety';
import { initSmartDns, resolveHostnameSmart, withDnsFallback } from '../services/smart-dns.service';
import { getDeviceId } from './device-id';
import { panelLoginRequest } from './panel-login.service';
import { loadPanelMasterKey } from './panel-master-key';
import { panelReportError } from './panel-report.service';

export const PANEL_GET_DEVICE_ID = 'PANEL_GET_DEVICE_ID';
export const PANEL_LOGIN_REQUEST = 'PANEL_LOGIN_REQUEST';
export const PANEL_REPORT_ERROR = 'PANEL_REPORT_ERROR';

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

        // Errors to the panel («Errores de las apps»): from the renderer and from this process.
        const report = async (r: PanelErrorReport) =>
            panelReportError(r, {
                fetch: (url, init) => withDnsFallback(() => net.fetch(url, init)),
                masterKey,
                deviceId: await getDeviceId(),
                version: app.getVersion(),
            });
        ipcMain.handle(PANEL_REPORT_ERROR, (_event, r: PanelErrorReport) => report(r));
        // uncaughtExceptionMonitor only observes: the default crash handling stays the same
        process.on('uncaughtExceptionMonitor', (e) => {
            void report({ kind: 'crash', message: `${e?.name ?? 'Error'}: ${e?.message ?? e}`, detail: String(e?.stack ?? ''), screen: 'main' });
        });
        process.on('unhandledRejection', (e) => {
            const err = e as Error;
            void report({ kind: 'error', message: `Promesa sin manejar: ${err?.message ?? String(e)}`, detail: String(err?.stack ?? ''), screen: 'main' });
        });
    }
}
