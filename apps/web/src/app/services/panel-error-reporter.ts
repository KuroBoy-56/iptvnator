import { ErrorHandler, Injectable } from '@angular/core';
import { PanelErrorReport, readTenantCode } from '@iptvnator/shared/interfaces';

type ReportBridge = { panelReportError?: (r: PanelErrorReport) => Promise<boolean> };

/**
 * Sends an error to the panel («Errores de las apps», owner only) through the Electron main
 * process (it encrypts with the panel key). In the PWA there is no bridge: nothing is sent.
 * The line password is never part of a report.
 */
export function reportPanelError(kind: PanelErrorReport['kind'], message: string, detail = '', screen = ''): void {
    const bridge = (window as unknown as { electron?: ReportBridge }).electron;
    if (!message || typeof bridge?.panelReportError !== 'function') return;
    let user = '';
    let server = '';
    try {
        user = localStorage.getItem('session_user') ?? '';
        server = localStorage.getItem('session_server') ?? '';
    } catch {
        /* storage blocked: report without the line */
    }
    bridge
        .panelReportError({
            kind,
            message: message.slice(0, 400),
            detail: detail.slice(0, 8000),
            screen: screen || location.hash || location.pathname,
            user,
            server,
            tenant: readTenantCode() || undefined,
        })
        .catch(() => undefined);
}

/** Angular's error handler: logs as before and reports the error to the panel. */
@Injectable()
export class PanelErrorHandler implements ErrorHandler {
    handleError(error: unknown): void {
        console.error(error);
        const e = error as { message?: string; stack?: string; rejection?: { message?: string; stack?: string } };
        const inner = e?.rejection ?? e;
        reportPanelError('error', String(inner?.message ?? error), String(inner?.stack ?? ''));
    }
}
