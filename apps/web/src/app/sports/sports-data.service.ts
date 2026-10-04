import { inject, Injectable } from '@angular/core';
import { Store } from '@ngrx/store';
import { firstValueFrom } from 'rxjs';
import { selectAllPlaylistsMeta } from '@iptvnator/m3u-state';
import {
    findSportsChannel,
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
}

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

    async findChannel(event: PanelSportsEvent): Promise<SportsChannelTarget | null> {
        const playlistId = await this.sessionPlaylistId();
        if (!playlistId) return null;
        const { streams, categories } = await this.liveChannels();
        const match = findSportsChannel(event, streams, categories, this.agenda?.match);
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
