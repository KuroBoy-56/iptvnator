import { inject, Injectable } from '@angular/core';
import { Store } from '@ngrx/store';
import { firstValueFrom } from 'rxjs';
import { selectAllPlaylistsMeta } from '@iptvnator/m3u-state';
import {
    findChannelByName,
    findSportsChannel,
    findSportsChannelForEvent,
    PanelSportsAgenda,
    PanelSportsEvent,
    PanelSyncService,
    providerApiGet,
    sessionCredentials,
    SportsChannelMatch,
    SportsLiveCategory,
    SportsLiveStream,
} from '@iptvnator/services';

const LIVE_CACHE_MS = 30 * 60_000;

export interface SportsChannelTarget extends SportsChannelMatch {
    playlistId: string;
    /** The broadcast channel asked for is not in the client's list: this is the team / event match. */
    missing?: string;
}

/** auto: broadcast channels first, then teams; teams: only teams / event name; tv: one broadcast channel. */
export type SportsWatchMode = { kind: 'auto' } | { kind: 'teams' } | { kind: 'tv'; name: string };

/**
 * Sports agenda from the panel and the "TV en vivo" lookup: the panel's
 * matching rules applied to the session line's live channels.
 */
@Injectable({ providedIn: 'root' })
export class SportsDataService {
    private readonly panelSync = inject(PanelSyncService);
    private readonly store = inject(Store);
    private live: { at: number; streams: SportsLiveStream[]; categories: SportsLiveCategory[] } | null = null;
    private agenda: PanelSportsAgenda | null = null;

    async loadAgenda(): Promise<PanelSportsAgenda | null> {
        const agenda = await this.panelSync.fetchSportsAgenda();
        if (agenda) this.agenda = agenda;
        return agenda ?? this.agenda;
    }

    async findChannel(event: PanelSportsEvent, mode: SportsWatchMode = { kind: 'auto' }): Promise<SportsChannelTarget | null> {
        const playlistId = await this.sessionPlaylistId();
        if (!playlistId) return null;
        const { streams, categories } = await this.liveChannels();
        const rules = this.agenda?.match;
        if (mode.kind === 'tv') {
            const st = findChannelByName(mode.name, streams);
            if (st) return { streamId: String(st.stream_id), categoryId: String(st.category_id ?? ''), name: String(st.name ?? ''), partial: false, playlistId };
            // the client does not have that channel: the event by teams / name in the event folders
            const alt = findSportsChannel(event, streams, categories, rules);
            return alt ? { ...alt, playlistId, missing: mode.name } : null;
        }
        const match = mode.kind === 'teams' ? findSportsChannel(event, streams, categories, rules) : findSportsChannelForEvent(event, streams, categories, rules);
        return match ? { ...match, playlistId } : null;
    }

    private async liveChannels(): Promise<{ streams: SportsLiveStream[]; categories: SportsLiveCategory[] }> {
        if (this.live && Date.now() - this.live.at < LIVE_CACHE_MS) return this.live;
        const creds = sessionCredentials();
        const [streams, categories] = await Promise.all([
            providerApiGet(creds, { action: 'get_live_streams' }),
            providerApiGet(creds, { action: 'get_live_categories' }),
        ]);
        const result = {
            at: Date.now(),
            streams: Array.isArray(streams) ? (streams as SportsLiveStream[]) : [],
            categories: Array.isArray(categories) ? (categories as SportsLiveCategory[]) : [],
        };
        if (result.streams.length) this.live = result;
        return result;
    }

    /** The Xtream playlist that belongs to the panel session. */
    private async sessionPlaylistId(): Promise<string | null> {
        const creds = sessionCredentials();
        const playlists = await firstValueFrom(this.store.select(selectAllPlaylistsMeta));
        const xtream = playlists.filter((p) => !!p.serverUrl);
        const own = xtream.find((p) => p.username === creds.username) ?? xtream[0];
        return own?._id ?? null;
    }
}
