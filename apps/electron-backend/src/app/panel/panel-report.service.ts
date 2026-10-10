import { arch, platform, release, type } from 'os';
import { panelAppId, panelEndpoint, PanelErrorReport } from '@iptvnator/shared/interfaces';
import { encryptPayload } from './panel-crypto';
import type { PanelFetch } from './panel-login.service';

const KINDS = ['crash', 'error', 'playback', 'network', 'panel', 'warning'];
const recent = new Map<string, number>();

export interface PanelReportDeps {
    fetch: PanelFetch;
    masterKey: Buffer | null;
    deviceId: string;
    version: string;
}

/**
 * Sends one error to the panel's api/report.php («Errores de las apps», owner only):
 * the same AES-GCM envelope as login.php, so nobody without the key can fill the log.
 * The same message is sent at most once a minute. Never throws.
 */
export async function panelReportError(report: PanelErrorReport, deps: PanelReportDeps): Promise<boolean> {
    const message = String(report?.message ?? '').trim().slice(0, 400);
    if (!message || !deps.masterKey) return false;
    const kind = KINDS.includes(String(report.kind)) ? String(report.kind) : 'error';
    const key = `${kind}|${message}`;
    const now = Date.now();
    if ((recent.get(key) ?? 0) > now - 60_000) return false;
    recent.set(key, now);
    if (recent.size > 200) recent.clear();
    const body: Record<string, string> = {
        app: panelAppId(),
        version: deps.version,
        kind,
        message,
        detail: String(report.detail ?? '').slice(0, 8000),
        screen: String(report.screen ?? '').slice(0, 120),
        device: deps.deviceId,
        model: `${type()} ${arch()}`,
        os: `${platform() === 'darwin' ? 'macOS' : type()} ${release()}`,
        user: String(report.user ?? '').slice(0, 80),
        server: String(report.server ?? '').slice(0, 200),
    };
    if (report.tenant && /^\d{6}$/.test(report.tenant)) body.tenant = report.tenant;
    try {
        const form = new URLSearchParams({ data: encryptPayload(JSON.stringify(body), deps.masterKey) });
        const res = await deps.fetch(panelEndpoint('report.php'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: form.toString(),
        });
        return res.status === 200;
    } catch {
        return false;
    }
}
