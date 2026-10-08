import {
    getPanelApiBase,
    getSessionAlertAccounts,
    panelEndpoint,
    readTenantFeatures,
    SessionAlertAccount,
    withTenantQuery,
} from '@iptvnator/shared/interfaces';

/** Alert configured in the panel's "Alertas" page (api/alerta.php?format=json). */
export interface PanelAlert {
    expiry: boolean;
    title: string;
    message: string;
    image: string;
    button: string;
}

const IMAGE_PATH = /^img\/alertas\/[A-Za-z0-9._-]+$/;

/** Maps the panel JSON to a PanelAlert; null when the reply is not an alert. */
export function parsePanelAlert(raw: unknown, panelRoot: string): PanelAlert | null {
    if (!raw || typeof raw !== 'object') return null;
    const j = raw as Record<string, unknown>;
    if (j['type'] !== 'welcome' && j['type'] !== 'expiry') return null;
    const expiry = j['type'] === 'expiry';
    const path = String(j['image_path'] ?? '');
    const abs = String(j['image'] ?? '');
    let image = '';
    if (!expiry) {
        if (IMAGE_PATH.test(path)) image = panelRoot + path;
        else if (/^https?:\/\//i.test(abs)) image = abs;
    }
    return {
        expiry,
        title: String(j['title'] ?? ''),
        message: String(j['message'] ?? ''),
        image,
        button: String(j['button'] || 'ENTENDIDO'),
    };
}

function alertUrl(acc: SessionAlertAccount): string {
    const q = new URLSearchParams({
        format: 'json',
        user: acc.user,
        pass: acc.pass,
        dns: acc.dns,
        title: acc.title ?? '',
    });
    // + &t=<code>&app=windows with a distributor (its own texts)
    return withTenantQuery(`${panelEndpoint('alerta.php')}?${q.toString()}`);
}

/**
 * Alert for this app start: the first expiry warning among the session lines,
 * else the first welcome. Best effort, null when the panel does not answer.
 */
export async function fetchPanelAlert(
    fetcher: typeof fetch = fetch
): Promise<PanelAlert | null> {
    // the distributor turned panel alerts off
    if (!readTenantFeatures().alerts) return null;
    const panelRoot = getPanelApiBase().replace(/api\/$/, '');
    let welcome: PanelAlert | null = null;
    for (const acc of getSessionAlertAccounts()) {
        if (!acc.user || !acc.pass || !acc.dns) continue;
        try {
            const res = await fetcher(alertUrl(acc), { cache: 'no-store' });
            if (!res.ok) continue;
            const alert = parsePanelAlert(await res.json(), panelRoot);
            if (alert?.expiry) return alert;
            welcome ??= alert;
        } catch {
            // best effort
        }
    }
    return welcome;
}
