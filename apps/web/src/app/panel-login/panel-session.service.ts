import { inject, Injectable } from '@angular/core';
import { Store } from '@ngrx/store';
import { firstValueFrom } from 'rxjs';
import { v4 as uuid } from 'uuid';
import { PlaylistActions, selectAllPlaylistsMeta } from '@iptvnator/m3u-state';
import { PanelSyncService, PlaylistDeleteActionService } from '@iptvnator/services';
import {
    clearSessionCredentials,
    normalizeXtreamServerUrl,
    Playlist,
    PlaylistMeta,
    setSessionAlertAccounts,
    setSessionPassword,
} from '@iptvnator/shared/interfaces';
import { PanelAccount } from './panel-login.service';

const DEFAULT_TITLE = 'LatMpx TV+';
const DEMO_TITLE = 'DEMO';

function same(a?: string, b?: string): boolean {
    return (a ?? '').trim().toLowerCase() === (b ?? '').trim().toLowerCase();
}

function sameServer(a?: string, b?: string): boolean {
    const clean = (v?: string) => (v ?? '').trim().replace(/\/+$/, '').toLowerCase();
    return clean(a) === clean(b);
}

/**
 * Turns the panel's active line into the app session: one Xtream playlist,
 * the session keys the rest of the app reads and a fresh panel sync. Lines
 * the panel no longer assigns to this device are removed.
 */
@Injectable({ providedIn: 'root' })
export class PanelSessionService {
    private readonly store = inject(Store);
    private readonly playlistDelete = inject(PlaylistDeleteActionService);
    private readonly panelSync = inject(PanelSyncService);

    async start(account: PanelAccount): Promise<void> {
        const server = normalizeXtreamServerUrl(account.server).trim();
        const playlists = await firstValueFrom(this.store.select(selectAllPlaylistsMeta));
        const title = account.isDemo ? DEMO_TITLE : DEFAULT_TITLE;
        const existing = playlists.find(
            (p) => same(p.username, account.username) && same(p.password, account.password) && sameServer(p.serverUrl, server)
        );

        await this.removeOtherLines(playlists, existing?._id);

        const id = existing?._id ?? uuid();
        if (!existing) {
            this.store.dispatch(
                PlaylistActions.addPlaylist({
                    playlist: {
                        _id: id,
                        title,
                        username: account.username,
                        password: account.password,
                        serverUrl: server,
                        importDate: new Date().toISOString(),
                        type: 'xtream',
                    } as unknown as Playlist,
                })
            );
        } else if (existing.title !== title) {
            this.store.dispatch(
                PlaylistActions.updatePlaylistMeta({ playlist: { _id: id, title } as PlaylistMeta })
            );
        }

        try {
            if (account.isDemo) localStorage.setItem(`is_demo_${id}`, 'true');
            else localStorage.removeItem(`is_demo_${id}`);
            localStorage.setItem('session_token', `panel-${id}`);
            localStorage.setItem('session_date', String(Date.now()));
            localStorage.setItem('session_user', account.username);
            localStorage.setItem('session_server', server);
            // Older versions stored the password here; it now stays in memory only.
            localStorage.removeItem('session_pass');
            localStorage.removeItem('alert_accounts');
        } catch {
            // Storage unavailable: the session still works for this run.
        }
        setSessionPassword(account.password);
        setSessionAlertAccounts([{ user: account.username, pass: account.password, dns: server, title }]);

        void this.panelSync.refresh({ username: account.username, password: account.password, server });
    }

    /** The device has no active line on the panel: drop the stored lines. */
    async clear(): Promise<void> {
        const playlists = await firstValueFrom(this.store.select(selectAllPlaylistsMeta));
        await this.removeOtherLines(playlists, undefined);
        try {
            ['session_token', 'session_date', 'session_user', 'session_pass', 'session_server', 'alert_accounts'].forEach((k) =>
                localStorage.removeItem(k)
            );
        } catch {
            // Nothing stored.
        }
        clearSessionCredentials();
    }

    private async removeOtherLines(playlists: PlaylistMeta[], keepId: string | undefined): Promise<void> {
        for (const playlist of playlists) {
            if (!playlist.serverUrl || playlist._id === keepId) continue;
            await this.playlistDelete.deletePlaylist(playlist);
            this.store.dispatch(PlaylistActions.removePlaylist({ playlistId: playlist._id }));
            try {
                localStorage.removeItem(`is_demo_${playlist._id}`);
            } catch {
                // ignore
            }
        }
    }
}
