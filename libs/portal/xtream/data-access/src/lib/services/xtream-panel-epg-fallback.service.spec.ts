import { TestBed } from '@angular/core/testing';
import { PanelSyncService } from '@iptvnator/services';
import {
    mapPanelProgram,
    upcomingPrograms,
    XtreamPanelEpgFallbackService,
} from './xtream-panel-epg-fallback.service';

describe('XtreamPanelEpgFallbackService', () => {
    let panelSync: { fetchFallbackEpg: jest.Mock };
    let service: XtreamPanelEpgFallbackService;
    const creds = { serverUrl: 'https://x.test', username: 'u', password: 'p' };

    beforeEach(() => {
        jest.useFakeTimers();
        panelSync = {
            fetchFallbackEpg: jest.fn().mockResolvedValue({
                '1': [{ s: 200, e: 300, t: 'Second' }, { s: 100, e: 200, t: 'First', d: 'Desc' }],
            }),
        };
        TestBed.configureTestingModule({
            providers: [{ provide: PanelSyncService, useValue: panelSync }],
        });
        service = TestBed.inject(XtreamPanelEpgFallbackService);
    });

    afterEach(() => jest.useRealTimers());

    it('collects concurrent channels into one panel request', async () => {
        const first = service.getPrograms({ streamId: 1, epgChannelId: 'canal5.mx', name: 'MX| Canal 5' }, creds);
        const second = service.getPrograms({ streamId: 2, name: 'Otro' }, creds);
        jest.advanceTimersByTime(300);
        const [a, b] = await Promise.all([first, second]);

        expect(panelSync.fetchFallbackEpg).toHaveBeenCalledTimes(1);
        expect(panelSync.fetchFallbackEpg).toHaveBeenCalledWith(
            [
                { id: '1', epg: 'canal5.mx', name: 'MX| Canal 5' },
                { id: '2', epg: '', name: 'Otro' },
            ],
            { username: 'u', password: 'p', server: 'https://x.test' }
        );
        expect(a.map((i) => i.title)).toEqual(['First', 'Second']);
        expect(b).toEqual([]);
    });

    it('serves repeated lookups from its cache', async () => {
        const first = service.getPrograms({ streamId: 1 }, creds);
        jest.advanceTimersByTime(300);
        await first;
        await service.getPrograms({ streamId: 1 }, creds);
        expect(panelSync.fetchFallbackEpg).toHaveBeenCalledTimes(1);
    });

    it('maps panel programs to EPG items and keeps upcoming ones', () => {
        const item = mapPanelProgram({ s: 100, e: 200, t: 'T', d: 'D' }, 9, 'ch');
        expect(item).toMatchObject({ title: 'T', description: 'D', channel_id: 'ch', start_timestamp: '100', stop_timestamp: '200' });
        expect(item.start).toBe(new Date(100_000).toISOString());
        expect(upcomingPrograms([item], 3, 150_000)).toEqual([item]);
        expect(upcomingPrograms([item], 3, 250_000)).toEqual([]);
    });
});
