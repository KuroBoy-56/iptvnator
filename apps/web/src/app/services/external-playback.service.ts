import { computed, Injectable, signal, inject, NgZone } from '@angular/core';
import { ExternalPlayerSession, PlayerContentInfo } from '@iptvnator/shared/interfaces';
import { FirebaseSyncService } from '@iptvnator/services';

@Injectable({
    providedIn: 'root',
})
export class ExternalPlaybackService {
    readonly activeSession = signal<ExternalPlayerSession | null>(null);
    private readonly dismissedSessionId = signal<string | null>(null);

    private readonly firebaseSync = inject(FirebaseSyncService);
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
            win.electron.ipcRenderer.on('MPV_PROGRESS_UPDATE', async (_event: any, data: any) => {
                if (!data || !data.pbInfo || data.position <= 5) return;
                
                const pbInfo = data.pbInfo;
                const isVod = pbInfo.type === 'movie';
                
                try {
                    await win.electron.ipcRenderer.invoke('DB_SAVE_PLAYBACK_POSITION', {
                        playlistId: pbInfo.playlistId,
                        data: {
                            contentXtreamId: Number(pbInfo.id),
                            contentType: isVod ? 'vod' : 'episode',
                            seriesXtreamId: isVod ? undefined : Number(pbInfo.categoryId),
                            positionSeconds: Math.floor(data.position),
                            durationSeconds: Math.floor(data.duration || data.position * 1.25)
                        }
                    });
                } catch(e) {}

                try {
                    const username = localStorage.getItem('session_user') || '';
                    const password = localStorage.getItem('session_pass') || '';
                    const server = localStorage.getItem('session_server') || '';
                    const userIdObj = { username, password, server };
                    
                    await this.firebaseSync.saveProgress(
                        userIdObj, 
                        pbInfo, 
                        data.position, 
                        data.duration
                    );
                } catch(e) {}
            });
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