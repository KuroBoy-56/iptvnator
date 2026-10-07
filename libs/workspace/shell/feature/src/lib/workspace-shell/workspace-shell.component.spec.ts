import {
    Component,
    Directive,
    input,
    output,
    signal,
} from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { RouterOutlet, provideRouter } from '@angular/router';
import { By } from '@angular/platform-browser';
import {
    WorkspacePortalContext,
    WorkspaceShellContextPanel,
} from '@iptvnator/workspace/shell/util';
import { WorkspaceShellComponent } from './workspace-shell.component';
import {
    WorkspaceHeaderBulkAction,
    WorkspaceShellFacade,
} from './services/workspace-shell.facade';
import { WorkspaceNfHeaderComponent } from './components/workspace-nf-header/workspace-nf-header.component';
import { WorkspaceKeyboardShortcutsService } from '../workspace-keyboard-shortcuts/workspace-keyboard-shortcuts.service';

@Component({
    selector: 'app-workspace-nf-header',
    template: '',
    standalone: true,
})
class MockWorkspaceNfHeaderComponent {
    readonly playlistId = input<string | null>(null);
    readonly solid = input(false);
    readonly canOpenAccount = input(false);
    readonly canRefresh = input(false);
    readonly refreshing = input(false);
    readonly accountRequested = output<void>();
    readonly refreshRequested = output<void>();
    readonly downloadsRequested = output<void>();

    focusSearchInput = jest.fn();
    containsSearchInput = jest.fn(() => false);
}

@Component({
    selector: 'app-workspace-shell-context-sidebar',
    template: '',
    standalone: true,
})
class MockWorkspaceShellContextSidebarComponent {
    readonly variant = input<WorkspaceShellContextPanel>('none');
    readonly context = input<WorkspacePortalContext | null>(null);
    readonly section = input<string | null>(null);
    readonly hasPlaylists = input(false);
}

@Component({
    selector: 'app-external-playback-dock',
    template: '',
    standalone: true,
})
class MockExternalPlaybackDockComponent {
    readonly session = input<unknown>(null);
    readonly closeClicked = output<void>();
}

@Component({
    selector: 'app-playlist-drop-overlay',
    template: '',
    standalone: true,
})
class MockPlaylistDropOverlayComponent {
    readonly state = input<unknown>({ kind: 'idle' });
}

@Directive({
    selector: '[appPlaylistDropZone]',
    exportAs: 'playlistDropZone',
    standalone: true,
})
class MockPlaylistDropZoneDirective {
    readonly overlayState = signal({ kind: 'idle' });
}

@Component({
    selector: 'app-workspace-shell-import-overlay',
    template: '',
    standalone: true,
})
class MockWorkspaceShellImportOverlayComponent {}

class MockWorkspaceKeyboardShortcutsService {
    openShortcutsDialog = jest.fn();
}

class MockWorkspaceShellFacade {
    readonly currentUrl = signal('/workspace/settings');
    readonly playlists = signal<
        { _id: string; serverUrl?: string; username?: string }[]
    >([]);
    readonly brandLink = signal('/workspace/dashboard');
    readonly brandTooltipKey = signal('WORKSPACE.SHELL.RAIL_DASHBOARD');
    readonly brandAriaLabelKey = signal('WORKSPACE.SHELL.OPEN_DASHBOARD');
    readonly workspaceLinks = signal([]);
    readonly primaryContextLinks = signal([]);
    readonly secondaryContextLinks = signal([]);
    readonly currentSection = signal<string | null>(null);
    readonly railProviderClass = signal('rail-context-region');
    readonly isSettingsRoute = signal(false);
    readonly playlistTitle = signal('Playlist A');
    readonly playlistSubtitle = signal('Subtitle');
    readonly canOpenPlaylistInfo = signal(true);
    readonly canOpenAccountInfo = signal(true);
    readonly searchQuery = signal('');
    readonly canUseSearch = signal(true);
    readonly searchPlaceholder = signal(
        'WORKSPACE.SHELL.SEARCH_PLAYLIST_PLACEHOLDER'
    );
    readonly searchScopeLabel = signal('Movies / All Items');
    readonly searchStatusLabel = signal('');
    readonly headerShortcut = signal(null);
    readonly canRefreshPlaylist = signal(false);
    readonly isRefreshingPlaylist = signal(false);
    readonly hasNoPlaylists = signal(false);
    readonly isDownloadsView = signal(false);
    readonly hasActiveDownloads = signal(false);
    readonly headerBulkAction = signal<WorkspaceHeaderBulkAction | null>(null);
    readonly showContextPanel = signal(true);
    readonly contextPanel = signal<WorkspaceShellContextPanel>('settings');
    readonly currentContext = signal<WorkspacePortalContext | null>(null);
    readonly showExternalPlaybackBar = signal(true);
    readonly externalPlaybackSession = signal({ id: 'session-1' });
    readonly showXtreamImportOverlay = signal(false);
    readonly xtreamImportCount = signal(0);
    readonly xtreamItemsToImport = signal(0);
    readonly xtreamActiveImportCount = signal(0);
    readonly xtreamActiveItemsToImport = signal(0);
    readonly xtreamImportTitleLabel = signal(
        'WORKSPACE.SHELL.XTREAM_IMPORT_TITLE'
    );
    readonly xtreamImportSourceLabel = signal(
        'WORKSPACE.SHELL.XTREAM_IMPORT_REMOTE_BADGE'
    );
    readonly xtreamImportPhaseLabel = signal(
        'WORKSPACE.SHELL.XTREAM_IMPORT_LOADING'
    );
    readonly xtreamImportDetailLabel = signal(
        'WORKSPACE.SHELL.XTREAM_IMPORT_DETAIL_REMOTE'
    );
    readonly xtreamImportProgressLabel = signal('');
    readonly xtreamImportPhaseTone = signal<'remote' | 'local' | null>(
        'remote'
    );
    readonly canCancelXtreamImport = signal(false);
    readonly isCancellingXtreamImport = signal(false);
    readonly isMacOS = true;
    readonly isElectron = true;

    onSearchInput = jest.fn();
    onSearchEnter = jest.fn();
    openCommandPalette = jest.fn();
    openGlobalSearch = jest.fn();
    openAddPlaylistDialog = jest.fn();
    runHeaderShortcut = jest.fn();
    refreshCurrentPlaylist = jest.fn();
    openDownloadsShortcut = jest.fn();
    runHeaderBulkAction = jest.fn();
    openPlaylistInfo = jest.fn();
    openAccountInfo = jest.fn();
    closeActiveExternalSession = jest.fn();
    cancelXtreamImport = jest.fn();
}

async function setup(facade = new MockWorkspaceShellFacade()) {
    await TestBed.configureTestingModule({
        imports: [WorkspaceShellComponent],
        providers: [provideRouter([])],
    })
        .overrideComponent(WorkspaceShellComponent, {
            set: {
                imports: [
                    RouterOutlet,
                    MockExternalPlaybackDockComponent,
                    MockPlaylistDropOverlayComponent,
                    MockPlaylistDropZoneDirective,
                    MockWorkspaceShellContextSidebarComponent,
                    MockWorkspaceNfHeaderComponent,
                    MockWorkspaceShellImportOverlayComponent,
                ],
                providers: [
                    {
                        provide: WorkspaceShellFacade,
                        useValue: facade,
                    },
                    {
                        provide: WorkspaceKeyboardShortcutsService,
                        useClass: MockWorkspaceKeyboardShortcutsService,
                    },
                ],
            },
        })
        .compileComponents();

    const fixture = TestBed.createComponent(WorkspaceShellComponent);
    fixture.detectChanges();
    const header = fixture.debugElement.query(
        By.directive(MockWorkspaceNfHeaderComponent)
    ).componentInstance as MockWorkspaceNfHeaderComponent;

    return { facade, fixture, header };
}

describe('WorkspaceShellComponent', () => {
    it('renders the Netflix header instead of the old rail and toolbar', async () => {
        const { fixture } = await setup();
        const el: HTMLElement = fixture.nativeElement;

        expect(el.querySelector('app-workspace-nf-header')).not.toBeNull();
        expect(el.querySelector('app-workspace-shell-rail')).toBeNull();
        expect(el.querySelector('app-workspace-shell-header')).toBeNull();
        expect(
            el.querySelector('app-workspace-shell-context-sidebar')
        ).not.toBeNull();
        expect(el.querySelector('app-external-playback-dock')).not.toBeNull();
        expect(WorkspaceNfHeaderComponent).toBeDefined();
    });

    it('renders the xtream import overlay child only when the facade flag is true', async () => {
        const { facade, fixture } = await setup();

        expect(
            fixture.nativeElement.querySelector(
                'app-workspace-shell-import-overlay'
            )
        ).toBeNull();

        facade.showXtreamImportOverlay.set(true);
        fixture.detectChanges();

        expect(
            fixture.nativeElement.querySelector(
                'app-workspace-shell-import-overlay'
            )
        ).not.toBeNull();
    });

    it('forwards header menu actions to the facade', async () => {
        const { facade, header } = await setup();

        header.accountRequested.emit();
        header.refreshRequested.emit();
        header.downloadsRequested.emit();

        expect(facade.openAccountInfo).toHaveBeenCalledTimes(1);
        expect(facade.refreshCurrentPlaylist).toHaveBeenCalledTimes(1);
        expect(facade.openDownloadsShortcut).toHaveBeenCalledTimes(1);
    });

    it('points the header to the first Xtream line and keeps it transparent over the billboard', async () => {
        const facade = new MockWorkspaceShellFacade();
        facade.playlists.set([
            { _id: 'm3u' },
            { _id: 'xt-1', serverUrl: 'http://line', username: 'u' },
        ]);
        facade.currentUrl.set('/workspace/xtreams/xt-1/home');
        const { fixture, header } = await setup(facade);

        expect(header.playlistId()).toBe('xt-1');
        expect(header.solid()).toBe(false);

        facade.currentUrl.set('/workspace/sports');
        fixture.detectChanges();

        expect(header.solid()).toBe(true);
    });

    it('focuses the header search on Ctrl/Cmd+F', async () => {
        const { facade, header } = await setup();
        const event = new KeyboardEvent('keydown', {
            key: 'f',
            metaKey: true,
            bubbles: true,
            cancelable: true,
        });

        document.dispatchEvent(event);

        expect(event.defaultPrevented).toBe(true);
        expect(facade.openGlobalSearch).not.toHaveBeenCalled();
        expect(header.focusSearchInput).toHaveBeenCalledWith({ select: true });
    });
});
