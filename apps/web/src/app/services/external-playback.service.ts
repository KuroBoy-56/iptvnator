import { computed, Injectable, signal, inject, NgZone } from '@angular/core';
import { ExternalPlayerSession, PlayerContentInfo } from '@iptvnator/shared/interfaces';
import { PanelSyncService, PlaybackSyncInfo } from '@iptvnator/services';

interface ExternalProgressUpdate {
    position: number;
    duration?: number;
    closed?: boolean;
    pbInfo?: PlaybackSyncInfo & { playlistId?: string };
}

@Injectable({
    providedIn: 'root',
})
export class ExternalPlaybackService {
    readonly activeSession = signal<ExternalPlayerSession | null>(null);
    private readonly dismissedSessionId = signal<string | null>(null);

    private readonly panelSync = inject(PanelSyncService);
    private readonly ngZone = inject(NgZone);

    readonly visibleSession = computed(() => {
        const session = this.activeSession();
        if (
            !session ||
            session.status === 'closed' ||
            session.status === 'error'
        ) {
            return null;
        }

        if (this.dismissedSessionId() === session.id) {
            return null;
        }

        return session;
    });

    constructor() {
        const win = window as any;
        
        if (win.electron?.onExternalPlayerSessionUpdate) {
            win.electron.onExternalPlayerSessionUpdate((session: ExternalPlayerSession) => {
                this.handleSessionUpdate(session);
            });
        }

        if (win.electron?.ipcRenderer) {
            win.electron.ipcRenderer.on(
                'MPV_PROGRESS_UPDATE',
                (_event: unknown, data: ExternalProgressUpdate) => {
                    void this.handleExternalProgress(data);
                }
            );
        }
    }

    /**
     * MPV and VLC report their position every couple of seconds and once more
     * when they close. The panel gets a throttled save while playing and a
     * forced save on close; the local row is only a cache.
     */
    private async handleExternalProgress(
        data: ExternalProgressUpdate | null | undefined
    ): Promise<void> {
        const pbInfo = data?.pbInfo;
        if (!data || !pbInfo || !(data.position > 5) || pbInfo.type === 'live') return;
        const isVod = pbInfo.type === 'movie';
        const duration = Math.floor(data.duration || 0);
        const electron = (window as any).electron;

        try {
            await electron?.ipcRenderer?.invoke('DB_SAVE_PLAYBACK_POSITION', {
                playlistId: pbInfo.playlistId,
                data: {
                    contentXtreamId: Number(pbInfo.id),
                    contentType: isVod ? 'vod' : 'episode',
                    seriesXtreamId: isVod ? undefined : Number(pbInfo.categoryId),
                    positionSeconds: Math.floor(data.position),
                    durationSeconds: duration || undefined,
                },
            });
        } catch {
            // Cache only; the panel save below is what matters.
        }

        try {
            await this.panelSync.saveProgress(
                null,
                pbInfo,
                data.position,
                duration,
                { force: !!data.closed }
            );
        } catch {
            // Panel unreachable: the next update retries.
        }
    }

    dismissActiveSession(): void {
        const session = this.activeSession();
        if (!session) {
            return;
        }

        this.dismissedSessionId.set(session.id);
    }

    async closeActiveSession(): Promise<void> {
        await this.closeSession(this.activeSession());
    }

    async closeSession(
        session: ExternalPlayerSession | null | undefined
    ): Promise<void> {
        if (!session) {
            return;
        }

        const electron = (window as any).electron;
        if (!session.canClose || !electron?.closeExternalPlayerSession) {
            this.dismissedSessionId.set(session.id);
            return;
        }

        const previousDismissedSessionId = this.dismissedSessionId();
        this.dismissedSessionId.set(session.id);

        try {
            const updatedSession = await electron.closeExternalPlayerSession(
                session.id
            );
            if (updatedSession) {
                this.handleSessionUpdate(updatedSession);
                return;
            }

            this.activeSession.update((current) =>
                current?.id === session.id
                    ? {
                          ...current,
                          status: 'closed',
                          canClose: false,
                          updatedAt: new Date().toISOString(),
                      }
                    : current
            );
        } catch (error) {
            if (this.dismissedSessionId() === session.id) {
                this.dismissedSessionId.set(previousDismissedSessionId);
            }
            throw error;
        }
    }

    findMatchingSession(
        contentInfo: PlayerContentInfo | null | undefined
    ): ExternalPlayerSession | null {
        const session = this.activeSession();
        if (!contentInfo || !session?.contentInfo) {
            return null;
        }

        if (session.status === 'error' || session.status === 'closed') {
            return null;
        }

        return this.matchesContent(contentInfo, session.contentInfo)
            ? session
            : null;
    }

    private handleSessionUpdate(session: ExternalPlayerSession): void {
        const current = this.activeSession();

        if (!current || current.id === session.id || session.status === 'launching') {
            this.ngZone.run(() => {
                this.activeSession.set(session);
            });
        }

        if (session.status === 'launching') {
            this.dismissedSessionId.set(null);
        }
    }

    private matchesContent(
        left: PlayerContentInfo,
        right: PlayerContentInfo
    ): boolean {
        return (
            left.playlistId === right.playlistId &&
            left.contentType === right.contentType &&
            left.contentXtreamId === right.contentXtreamId
        );
    }
}