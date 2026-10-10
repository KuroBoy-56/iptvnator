import {
    ChangeDetectionStrategy,
    Component,
    DestroyRef,
    ElementRef,
    computed,
    inject,
    input,
    output,
    signal,
    viewChild,
} from '@angular/core';
import { MatIcon } from '@angular/material/icon';
import { Router, RouterLink, RouterLinkActive } from '@angular/router';
import { PanelBrandingService } from '@iptvnator/services';

interface NfNavLink {
    label: string;
    path: string[];
    exact?: boolean;
}

/**
 * Netflix top bar, same as the web player (header.php): brand, sections,
 * search, clock and profile menu. Replaces the old rail + toolbar.
 */
@Component({
    selector: 'app-workspace-nf-header',
    standalone: true,
    imports: [MatIcon, RouterLink, RouterLinkActive],
    templateUrl: './workspace-nf-header.component.html',
    host: {
        class: 'nf-header',
        '[class.solid]': 'solid()',
        '(document:click)': 'closeMenu($event)',
    },
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WorkspaceNfHeaderComponent {
    /** Xtream playlist the sections point to (the panel line). */
    readonly playlistId = input<string | null>(null);
    readonly solid = input(false);
    readonly canOpenAccount = input(false);
    readonly canRefresh = input(false);
    readonly refreshing = input(false);
    readonly accountRequested = output<void>();
    readonly refreshRequested = output<void>();
    readonly downloadsRequested = output<void>();

    private readonly router = inject(Router);
    private readonly host = inject(ElementRef<HTMLElement>);
    private readonly searchInput =
        viewChild<ElementRef<HTMLInputElement>>('searchInput');

    /** Distributor name / logo (built-in brand with "Omitir"). */
    protected readonly branding = inject(PanelBrandingService);
    protected readonly logoFailed = signal(false);
    protected readonly searchOpen = signal(false);
    protected readonly menuOpen = signal(false);
    protected readonly now = signal(new Date());
    protected readonly user = readUser();

    protected readonly root = computed(() => {
        const id = this.playlistId();
        return id ? ['/workspace', 'xtreams', id] : null;
    });
    protected readonly links = computed<NfNavLink[]>(() => {
        const root = this.root();
        // the distributor can turn the sports section off
        const sports: NfNavLink[] = this.branding.features().sports
            ? [{ label: 'Deportes', path: ['/workspace', 'sports'] }]
            : [];
        if (!root)
            return [
                { label: 'Inicio', path: ['/workspace', 'sources'] },
                ...sports,
            ];
        return [
            { label: 'Inicio', path: [...root, 'home'] },
            { label: 'Series', path: [...root, 'series'] },
            { label: 'Películas', path: [...root, 'vod'] },
            { label: 'TV en vivo', path: [...root, 'live'] },
            ...sports,
            { label: 'Explorar', path: [...root, 'explore'] },
        ];
    });
    protected readonly time = computed(() =>
        this.now().toLocaleTimeString('es', {
            hour: '2-digit',
            minute: '2-digit',
        })
    );
    protected readonly date = computed(() =>
        this.now().toLocaleDateString('es', {
            weekday: 'short',
            day: 'numeric',
            month: 'short',
        })
    );

    constructor() {
        const timer = setInterval(() => this.now.set(new Date()), 20_000);
        inject(DestroyRef).onDestroy(() => clearInterval(timer));
    }

    /** Used by the shell's Ctrl+F handler. */
    containsSearchInput(target: EventTarget | null): boolean {
        return !!target && target === this.searchInput()?.nativeElement;
    }

    focusSearchInput(options?: { select?: boolean }): void {
        this.searchOpen.set(true);
        setTimeout(() => {
            const el = this.searchInput()?.nativeElement;
            el?.focus();
            if (options?.select) el?.select();
        });
    }

    protected toggleSearch(): void {
        if (this.searchOpen()) {
            this.searchOpen.set(false);
            return;
        }
        this.focusSearchInput();
    }

    protected search(value: string): void {
        const root = this.root();
        const q = value.trim();
        if (!root || !q) return;
        // same as the web player: search opens Explorar filtered by title
        void this.router.navigate([...root, 'explore'], { queryParams: { q } });
    }

    protected blurSearch(value: string): void {
        if (!value.trim()) this.searchOpen.set(false);
    }

    protected toggleMenu(event: Event): void {
        event.stopPropagation();
        this.menuOpen.update((open) => !open);
    }

    protected closeMenu(event: Event): void {
        if (
            this.menuOpen() &&
            !this.host.nativeElement
                .querySelector('.nf-profile')
                ?.contains(event.target as Node)
        ) {
            this.menuOpen.set(false);
        }
    }

    protected go(path: string[]): void {
        this.menuOpen.set(false);
        void this.router.navigate(path);
    }

    protected account(): void {
        this.menuOpen.set(false);
        this.accountRequested.emit();
    }

    protected refresh(): void {
        this.menuOpen.set(false);
        this.refreshRequested.emit();
    }

    protected downloads(): void {
        this.menuOpen.set(false);
        this.downloadsRequested.emit();
    }
}

function readUser(): string {
    try {
        return localStorage.getItem('session_user') ?? '';
    } catch {
        return '';
    }
}
