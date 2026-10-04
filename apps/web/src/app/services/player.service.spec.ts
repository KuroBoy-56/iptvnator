import { TestBed } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';
import { DataService, PanelSyncService } from '@iptvnator/services';
import { ExternalPlayerSession, VideoPlayer } from '@iptvnator/shared/interfaces';
import { SettingsStore } from './settings-store.service';
import { PlayerService } from './player.service';

describe('PlayerService', () => {
    let service: PlayerService;
    const dialog = {
        open: jest.fn(),
    };
    const dataService = {
        sendIpcEvent: jest.fn(),
    };
    const settingsStore = {
        player: jest.fn(() => VideoPlayer.VideoJs),
    };
    const panelSync = {
        getProgress: jest.fn().mockResolvedValue(0),
    };

    beforeEach(() => {
        TestBed.configureTestingModule({
            providers: [
                PlayerService,
                {
                    provide: MatDialog,
                    useValue: dialog,
                },
                {
                    provide: DataService,
                    useValue: dataService,
                },
                {
                    provide: SettingsStore,
                    useValue: settingsStore,
                },
                {
                    provide: PanelSyncService,
                    useValue: panelSync,
                },
            ],
        });

        service = TestBed.inject(PlayerService);
        dialog.open.mockReset();
        dataService.sendIpcEvent.mockReset();
        settingsStore.player.mockReset();
        settingsStore.player.mockReturnValue(VideoPlayer.VideoJs);
        panelSync.getProgress.mockReset();
        panelSync.getProgress.mockResolvedValue(0);
    });

    it('resumes external players from the panel position', async () => {
        settingsStore.player.mockReturnValue(VideoPlayer.VLC);
        dataService.sendIpcEvent.mockResolvedValue(undefined);
        panelSync.getProgress.mockResolvedValue(733);

        await service.openResolvedPlayback({
            streamUrl: 'https://example.com/movie.mp4',
            title: 'Movie',
            startTime: 10,
            contentInfo: {
                playlistId: 'playlist-1',
                contentXtreamId: 77,
                contentType: 'vod',
            },
        });

        expect(panelSync.getProgress).toHaveBeenCalledWith(null, {
            type: 'movie',
            id: 77,
        });
        expect(dataService.sendIpcEvent).toHaveBeenCalledWith(
            'OPEN_VLC_PLAYER',
            expect.objectContaining({ startTime: 733 })
        );
    });

    it('keeps the caller position when the panel has none', async () => {
        settingsStore.player.mockReturnValue(VideoPlayer.MPV);
        dataService.sendIpcEvent.mockResolvedValue(undefined);

        await service.openResolvedPlayback({
            streamUrl: 'https://example.com/ep.mp4',
            title: 'Episode',
            startTime: 42,
            contentInfo: {
                playlistId: 'playlist-1',
                contentXtreamId: 5,
                contentType: 'episode',
                seriesXtreamId: 9,
            },
        });

        expect(dataService.sendIpcEvent).toHaveBeenCalledWith(
            'OPEN_MPV_PLAYER',
            expect.objectContaining({ startTime: 42 })
        );
    });

    it('identifies embedded players', () => {
        expect(service.isEmbeddedPlayer(VideoPlayer.VideoJs)).toBe(true);
        expect(service.isEmbeddedPlayer(VideoPlayer.Html5Player)).toBe(true);
        expect(service.isEmbeddedPlayer(VideoPlayer.ArtPlayer)).toBe(true);
        // This build treats every MPV variant as an external player.
        expect(service.isEmbeddedPlayer(VideoPlayer.EmbeddedMpv)).toBe(false);
        expect(service.isEmbeddedPlayer(VideoPlayer.MPV)).toBe(false);
        expect(service.isEmbeddedPlayer(VideoPlayer.VLC)).toBe(false);
    });

    it('does not open a dialog or IPC for embedded players', async () => {
        const result = await service.openResolvedPlayback({
            streamUrl: 'https://example.com/video.mp4',
            title: 'Example Video',
        });

        expect(result).toBeUndefined();
        expect(dialog.open).not.toHaveBeenCalled();
        expect(dataService.sendIpcEvent).not.toHaveBeenCalled();
    });

    it('forwards external playback launches through IPC', async () => {
        const session: ExternalPlayerSession = {
            id: 'session-1',
            player: 'mpv',
            status: 'opened',
            title: 'Example Video',
            streamUrl: 'https://example.com/video.mp4',
            startedAt: '2026-03-07T10:00:00.000Z',
            updatedAt: '2026-03-07T10:00:00.000Z',
            canClose: true,
        };
        settingsStore.player.mockReturnValue(VideoPlayer.MPV);
        dataService.sendIpcEvent.mockResolvedValue(session);

        const result = await service.openResolvedPlayback({
            streamUrl: 'https://example.com/video.mp4',
            title: 'Example Video',
        });

        expect(dataService.sendIpcEvent).toHaveBeenCalledWith(
            'OPEN_MPV_PLAYER',
            expect.objectContaining({
                url: 'https://example.com/video.mp4',
                title: 'Example Video',
            })
        );
        expect(result).toEqual(session);
    });

    it('forces external playback without changing the selected embedded player', async () => {
        const session: ExternalPlayerSession = {
            id: 'session-2',
            player: 'vlc',
            status: 'opened',
            title: 'Example Live',
            streamUrl: 'https://example.com/live.m3u8',
            startedAt: '2026-03-07T10:00:00.000Z',
            updatedAt: '2026-03-07T10:00:00.000Z',
            canClose: true,
        };
        settingsStore.player.mockReturnValue(VideoPlayer.VideoJs);
        dataService.sendIpcEvent.mockResolvedValue(session);

        const result = await service.openExternalPlayback(
            {
                streamUrl: 'https://example.com/live.m3u8',
                title: 'Example Live',
                userAgent: 'IPTVnator Test',
                referer: 'https://referrer.example.com',
                origin: 'https://origin.example.com',
            },
            'vlc'
        );

        expect(dataService.sendIpcEvent).toHaveBeenCalledWith(
            'OPEN_VLC_PLAYER',
            expect.objectContaining({
                url: 'https://example.com/live.m3u8',
                title: 'Example Live',
                'user-agent': 'IPTVnator Test',
                referer: 'https://referrer.example.com',
                origin: 'https://origin.example.com',
            })
        );
        expect(dialog.open).not.toHaveBeenCalled();
        expect(result).toEqual(session);
    });
});
