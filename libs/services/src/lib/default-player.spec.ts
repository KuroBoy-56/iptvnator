import { of } from 'rxjs';
import { Settings, STORE_KEY, VideoPlayer } from '@iptvnator/shared/interfaces';
import {
    defaultVideoPlayer,
    migrateDefaultPlayer,
    PLAYER_MPV_MIGRATED_KEY,
} from './default-player';

type ElectronWindow = { electron?: unknown };

function setElectron(on: boolean): void {
    if (on) (window as ElectronWindow).electron = {};
    else delete (window as ElectronWindow).electron;
}

/** SettingsStore built with window.electron already set (DEFAULT_SETTINGS is read when the module loads). */
function desktopStore(stored: Partial<Settings> | null) {
    let store!: {
        loadSettings(): Promise<void>;
        player(): VideoPlayer;
        updateSettings(s: Partial<Settings>): Promise<void>;
    };
    const storage = {
        get: jest.fn(() => of(stored)),
        set: jest.fn(() => of(undefined)),
    };
    jest.isolateModules(() => {
        // the same Angular copy as the store loaded here
        const { Injector } = require('@angular/core');
        const { StorageMap } = require('@ngx-pwa/local-storage');
        const { SettingsStore } = require('./settings-store.service');
        const injector = Injector.create({
            providers: [SettingsStore, { provide: StorageMap, useValue: storage }],
        });
        store = injector.get(SettingsStore);
    });
    return { store, storage };
}

describe('MPV as the default player (desktop app)', () => {
    beforeEach(() => {
        localStorage.removeItem(PLAYER_MPV_MIGRATED_KEY);
        localStorage.setItem('mpx:language-auto-v1', '1');
    });
    afterEach(() => setElectron(false));

    it('is MPV in the desktop app and Video.js in the PWA', () => {
        setElectron(true);
        expect(defaultVideoPlayer()).toBe(VideoPlayer.MPV);
        setElectron(false);
        expect(defaultVideoPlayer()).toBe(VideoPlayer.VideoJs);
    });

    it('moves the old Video.js default to MPV only once', () => {
        setElectron(true);
        expect(migrateDefaultPlayer(VideoPlayer.VideoJs)).toBe(VideoPlayer.MPV);
        expect(migrateDefaultPlayer(VideoPlayer.VLC)).toBe(VideoPlayer.VLC);
        localStorage.setItem(PLAYER_MPV_MIGRATED_KEY, '1');
        expect(migrateDefaultPlayer(VideoPlayer.VideoJs)).toBe(VideoPlayer.VideoJs);
    });

    it('never changes the PWA player', () => {
        setElectron(false);
        expect(migrateDefaultPlayer(VideoPlayer.VideoJs)).toBe(VideoPlayer.VideoJs);
    });

    it('first start of the desktop app: MPV', async () => {
        setElectron(true);
        const { store } = desktopStore(null);
        await store.loadSettings();
        expect(store.player()).toBe(VideoPlayer.MPV);
        expect(localStorage.getItem(PLAYER_MPV_MIGRATED_KEY)).toBe('1');
    });

    it('saved settings with the old Video.js default: MPV, saved once', async () => {
        setElectron(true);
        const { store, storage } = desktopStore({ player: VideoPlayer.VideoJs } as Partial<Settings>);
        await store.loadSettings();
        expect(store.player()).toBe(VideoPlayer.MPV);
        expect(storage.set).toHaveBeenCalledWith(
            STORE_KEY.Settings,
            expect.objectContaining({ player: VideoPlayer.MPV })
        );
    });

    it('a player chosen after the switch is kept (Video.js too)', async () => {
        setElectron(true);
        localStorage.setItem(PLAYER_MPV_MIGRATED_KEY, '1');
        const { store, storage } = desktopStore({ player: VideoPlayer.VideoJs } as Partial<Settings>);
        await store.loadSettings();
        expect(store.player()).toBe(VideoPlayer.VideoJs);
        expect(storage.set).not.toHaveBeenCalled();
    });

    it('keeps VLC or embedded MPV chosen before', async () => {
        setElectron(true);
        const { store } = desktopStore({ player: VideoPlayer.VLC } as Partial<Settings>);
        await store.loadSettings();
        expect(store.player()).toBe(VideoPlayer.VLC);
    });
});
