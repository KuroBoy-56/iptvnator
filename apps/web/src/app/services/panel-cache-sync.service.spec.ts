import { TestBed } from '@angular/core/testing';
import { provideMockStore } from '@ngrx/store/testing';
import { selectAllPlaylistsMeta } from '@iptvnator/m3u-state';
import {
    DatabaseService,
    PanelSyncService,
    PlaybackPositionRuntimeBridgeService,
} from '@iptvnator/services';
import { PanelCacheSyncService } from './panel-cache-sync.service';

describe('PanelCacheSyncService', () => {
    const db = {
        getFavorites: jest.fn(),
        removeFromFavorites: jest.fn().mockResolvedValue(true),
        addToFavorites: jest.fn().mockResolvedValue(true),
        getContentByXtreamId: jest.fn(),
    };
    const positions = {
        getAllPlaybackPositions: jest.fn(),
        savePlaybackPosition: jest.fn().mockResolvedValue(undefined),
        clearPlaybackPosition: jest.fn().mockResolvedValue(undefined),
    };
    const panel = {
        refresh: jest.fn().mockResolvedValue(undefined),
        getAllProgress: jest.fn(),
        getAllFavorites: jest.fn(),
    };

    beforeEach(() => {
        jest.clearAllMocks();
        TestBed.configureTestingModule({
            providers: [
                provideMockStore({
                    selectors: [
                        {
                            selector: selectAllPlaylistsMeta,
                            value: [{ _id: 'pl1', username: 'u', password: 'p', serverUrl: 'http://s.test' }],
                        },
                    ],
                }),
                { provide: DatabaseService, useValue: db },
                { provide: PlaybackPositionRuntimeBridgeService, useValue: positions },
                { provide: PanelSyncService, useValue: panel },
            ],
        });
    });

    it('rebuilds local favorites and positions from the panel', async () => {
        panel.getAllProgress.mockResolvedValue({
            Movie: { '10': { timeline: 300, duration: 6000 } },
            Series: { '50': { '501': { timeline: 60, duration: 1500 } } },
        });
        panel.getAllFavorites.mockResolvedValue({
            Movie: { '7': { thumbnail: 'https://p/7.jpg' } },
            Series: {},
            LiveTv: {},
        });
        db.getFavorites.mockResolvedValue([
            { id: 900, xtream_id: 3, type: 'live' },
        ]);
        db.getContentByXtreamId.mockResolvedValue({ id: 70, xtream_id: 7 });
        positions.getAllPlaybackPositions.mockResolvedValue([
            { contentXtreamId: 10, contentType: 'vod', positionSeconds: 300 },
            { contentXtreamId: 99, contentType: 'vod', positionSeconds: 30, updatedAt: '2020-01-01T00:00:00Z' },
        ]);

        await TestBed.inject(PanelCacheSyncService).syncAll();

        expect(panel.refresh).toHaveBeenCalledWith({ username: 'u', password: 'p', server: 'http://s.test' });
        expect(db.removeFromFavorites).toHaveBeenCalledWith(900, 'pl1');
        expect(db.getContentByXtreamId).toHaveBeenCalledWith(7, 'pl1', 'movie');
        expect(db.addToFavorites).toHaveBeenCalledWith(70, 'pl1', 'https://p/7.jpg');
        expect(positions.savePlaybackPosition).toHaveBeenCalledTimes(1);
        expect(positions.savePlaybackPosition).toHaveBeenCalledWith('pl1', expect.objectContaining({ contentXtreamId: 501, seriesXtreamId: 50 }));
        expect(positions.clearPlaybackPosition).toHaveBeenCalledWith('pl1', 99, 'vod');
    });
});
