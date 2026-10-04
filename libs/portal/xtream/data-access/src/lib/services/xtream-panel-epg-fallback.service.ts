import { inject, Injectable } from '@angular/core';
import { PanelEpgProgram, PanelSyncService } from '@iptvnator/services';
import { EpgItem } from '@iptvnator/shared/interfaces';

export interface PanelEpgRequest {
    streamId: number;
    epgChannelId?: string | null;
    name?: string | null;
}

interface PanelEpgCredentials {
    username?: string;
    password?: string;
    serverUrl?: string;
}

const CACHE_TTL_MS = 10 * 60 * 1000;
const FLUSH_DELAY_MS = 250;

/** Panel program -> the EpgItem shape the Xtream UI renders. */
export function mapPanelProgram(
    program: PanelEpgProgram,
    streamId: number,
    channelId: string
): EpgItem {
    const start = new Date(program.s * 1000).toISOString();
    const stop = new Date(program.e * 1000).toISOString();
    return {
        id: `panel|${streamId}|${program.s}`,
        epg_id: '',
        title: program.t ?? '',
        lang: '',
        start,
        end: stop,
        stop,
        description: program.d ?? '',
        channel_id: channelId,
        start_timestamp: String(program.s),
        stop_timestamp: String(program.e),
    };
}

/**
 * Second EPG source: when the provider's get_short_epg/get_simple_data_table
 * returns nothing for a channel, the panel (api/epg.php) is asked for it.
 * Concurrent requests are collected and sent together; the panel accepts up
 * to 400 channels per call (PanelSyncService splits larger sets).
 */
@Injectable({ providedIn: 'root' })
export class XtreamPanelEpgFallbackService {
    private readonly panelSync = inject(PanelSyncService);
    private readonly cache = new Map<string, { at: number; items: EpgItem[] }>();
    private pending = new Map<string, { request: PanelEpgRequest; waiters: ((items: EpgItem[]) => void)[] }>();
    private pendingCreds: PanelEpgCredentials | null = null;
    private timer: ReturnType<typeof setTimeout> | null = null;

    getPrograms(request: PanelEpgRequest, creds: PanelEpgCredentials): Promise<EpgItem[]> {
        const key = this.key(creds, request.streamId);
        const cached = this.cache.get(key);
        if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
            return Promise.resolve(cached.items);
        }
        if (this.pendingCreds && this.pendingCreds.username !== creds.username) {
            this.flush();
        }
        return new Promise((resolve) => {
            const entry = this.pending.get(key) ?? { request, waiters: [] };
            entry.waiters.push(resolve);
            this.pending.set(key, entry);
            this.pendingCreds = creds;
            if (!this.timer) {
                this.timer = setTimeout(() => this.flush(), FLUSH_DELAY_MS);
            }
        });
    }

    private key(creds: PanelEpgCredentials, streamId: number): string {
        return `${creds.serverUrl ?? ''}|${creds.username ?? ''}|${streamId}`;
    }

    private flush(): void {
        if (this.timer) clearTimeout(this.timer);
        this.timer = null;
        const batch = this.pending;
        const creds = this.pendingCreds ?? {};
        this.pending = new Map();
        this.pendingCreds = null;
        if (batch.size === 0) return;

        const channels = Array.from(batch.values()).map(({ request }) => ({
            id: String(request.streamId),
            epg: request.epgChannelId?.trim() || '',
            name: request.name?.trim() || '',
        }));
        this.panelSync
            .fetchFallbackEpg(channels, {
                username: creds.username,
                password: creds.password,
                server: creds.serverUrl,
            })
            .catch(() => ({} as Record<string, PanelEpgProgram[]>))
            .then((epg) => {
                for (const [key, { request, waiters }] of batch) {
                    const channelId = request.epgChannelId?.trim() || String(request.streamId);
                    const items = (epg[String(request.streamId)] ?? [])
                        .filter((p) => p && p.e > p.s)
                        .sort((a, b) => a.s - b.s)
                        .map((p) => mapPanelProgram(p, request.streamId, channelId));
                    this.cache.set(key, { at: Date.now(), items });
                    waiters.forEach((resolve) => resolve(items));
                }
            });
    }
}

/** Programs that have not ended yet, current first. */
export function upcomingPrograms(items: EpgItem[], limit: number, nowMs = Date.now()): EpgItem[] {
    return items
        .filter((item) => Number(item.stop_timestamp) * 1000 > nowMs)
        .slice(0, limit);
}
