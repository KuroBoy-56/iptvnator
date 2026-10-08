import {
    Component,
    DestroyRef,
    HostListener,
    computed,
    inject,
    signal,
    viewChild,
    OnInit,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { filter } from 'rxjs';
import { ExternalPlaybackDockComponent } from '@iptvnator/ui/components';
import { DOCUMENT } from '@angular/common';
import {
    PlaylistDropOverlayComponent,
    PlaylistDropZoneDirective,
} from '../playlist-drop-overlay';
import { WorkspaceShellContextSidebarComponent } from './components/workspace-shell-context-sidebar/workspace-shell-context-sidebar.component';
import { WorkspaceShellImportOverlayComponent } from './components/workspace-shell-import-overlay/workspace-shell-import-overlay.component';
import { WorkspaceNfHeaderComponent } from './components/workspace-nf-header/workspace-nf-header.component';
import { WorkspaceShellFacade } from './services/workspace-shell.facade';
import { WorkspaceShellXtreamImportService } from './services/workspace-shell-xtream-import.service';
import { WorkspaceShellCommandPaletteService } from './services/workspace-shell-command-palette.service';
import { WorkspaceShellHeaderService } from './services/workspace-shell-header.service';
import { WorkspaceShellRouteStateService } from './services/workspace-shell-route-state.service';
import { WorkspaceShellSearchSyncService } from './services/workspace-shell-search-sync.service';
import { WorkspaceShellSearchService } from './services/workspace-shell-search.service';
import { WorkspaceKeyboardShortcutsService } from '../workspace-keyboard-shortcuts/workspace-keyboard-shortcuts.service';
import { WorkspacePanelAlertComponent } from './components/workspace-panel-alert/workspace-panel-alert.component';

@Component({
    selector: 'app-workspace-shell',
    imports: [
        ExternalPlaybackDockComponent,
        PlaylistDropOverlayComponent,
        PlaylistDropZoneDirective,
        RouterOutlet,
        WorkspaceShellContextSidebarComponent,
        WorkspaceNfHeaderComponent,
        WorkspaceShellImportOverlayComponent,
        WorkspacePanelAlertComponent,
    ],
    templateUrl: './workspace-shell.component.html',
    styleUrl: './workspace-shell.component.scss',
    providers: [
        WorkspaceShellFacade,
        WorkspaceShellRouteStateService,
        WorkspaceShellSearchSyncService,
        WorkspaceShellSearchService,
        WorkspaceShellHeaderService,
        WorkspaceShellXtreamImportService,
        WorkspaceShellCommandPaletteService,
        WorkspaceKeyboardShortcutsService,
    ],
})
export class WorkspaceShellComponent implements OnInit {
    readonly facade = inject(WorkspaceShellFacade);
    readonly keyboardShortcuts = inject(WorkspaceKeyboardShortcutsService);
    private readonly document = inject(DOCUMENT);
    private readonly router = inject(Router);
    private readonly destroyRef = inject(DestroyRef);
    private readonly header = viewChild<WorkspaceShellHeaderShortcutTarget>(
        'workspaceHeader'
    );
    private readonly scrolled = signal(false);
    private lastPath = '';

    /** Xtream line the Netflix header points to: the open one, else the first. */
    readonly homePlaylistId = computed(() => {
        const context = this.facade.currentContext();
        if (context?.provider === 'xtreams') return context.playlistId;
        return (
            this.facade
                .playlists()
                .find((playlist) => !!playlist.serverUrl && !!playlist.username)
                ?._id ?? null
        );
    });
    /** Pages whose billboard/heading sits under the transparent header. */
    readonly heroPage = computed(() =>
        isHeroPath(this.facade.currentUrl().split('?')[0])
    );
    readonly solidHeader = computed(() => !this.heroPage() || this.scrolled());

    onContentScroll(event: Event): void {
        const top = (event.target as HTMLElement).scrollTop;
        this.scrolled.set(top > 30);
    }

    ngOnInit(): void {
        this.resetScrollOnPageChange();
    }

    /** New page starts at the top (query-only changes keep the position). */
    private resetScrollOnPageChange(): void {
        this.router.events
            .pipe(
                filter((e) => e instanceof NavigationEnd),
                takeUntilDestroyed(this.destroyRef)
            )
            .subscribe(() => {
                const path = this.router.url.split('?')[0];
                if (path === this.lastPath) return;
                this.lastPath = path;
                const main = this.document.querySelector('.workspace-content');
                if (main) main.scrollTop = 0;
                this.scrolled.set(false);
            });
    }

    @HostListener('document:keydown', ['$event'])
    onDocumentKeydown(event: KeyboardEvent): void {
        if (
            event.defaultPrevented ||
            !this.facade.isElectron ||
            !isFindShortcut(event)
        ) {
            return;
        }

        const header = this.header();
        const target = event.target;
        if (isEditableTarget(target) && !header?.containsSearchInput(target)) {
            return;
        }

        event.preventDefault();
        header?.focusSearchInput({ select: true });
    }
}

function isHeroPath(path: string): boolean {
    return /^\/workspace\/xtreams\/[^/]+\/(home|explore|vod|series)\/?$/.test(
        path
    );
}

function isFindShortcut(event: KeyboardEvent): boolean {
    return (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'f';
}

function isEditableTarget(target: EventTarget | null): boolean {
    if (!(target instanceof HTMLElement)) {
        return false;
    }

    if (target.isContentEditable) {
        return true;
    }

    const tagName = target.tagName.toLowerCase();
    return (
        tagName === 'input' || tagName === 'textarea' || tagName === 'select'
    );
}

interface WorkspaceShellHeaderShortcutTarget {
    containsSearchInput(target: EventTarget | null): boolean;
    focusSearchInput(options?: { select?: boolean }): void;
}