import {
    ChangeDetectionStrategy,
    Component,
    computed,
    DestroyRef,
    inject,
    OnInit,
    signal,
} from '@angular/core';
import { MatSnackBar } from '@angular/material/snack-bar';
import { NgTemplateOutlet } from '@angular/common';
import { Router } from '@angular/router';
import { PanelSportMeta } from '@iptvnator/services';
import { buildXtreamNavigationTarget } from '@iptvnator/portal/shared/util';
import { SportsDataService } from './sports-data.service';
import {
    DEFAULT_SPORTS_META,
    groupByLeague,
    hasScore,
    matchesSportsQuery,
    SportsCard,
    sportCounts,
    sportsDayKey,
    sportsEventStatus,
    SportsEventStatus,
    toSportsCards,
} from './sports-schedule.util';

interface SportChip {
    key: string;
    label: string;
    icon: string;
    count: number;
}

@Component({
    selector: 'app-sports',
    templateUrl: './sports.component.html',
    styleUrl: './sports.component.scss',
    imports: [NgTemplateOutlet],
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SportsComponent implements OnInit {
    private readonly data = inject(SportsDataService);
    private readonly router = inject(Router);
    private readonly snackBar = inject(MatSnackBar);

    readonly loading = signal(true);
    readonly events = signal<SportsCard[]>([]);
    readonly meta = signal<Record<string, PanelSportMeta>>(DEFAULT_SPORTS_META);
    readonly day = signal<0 | 1>(0);
    readonly sport = signal('');
    readonly query = signal('');
    readonly now = signal(Date.now());
    readonly busyId = signal<string | null>(null);
    private readonly timeFormat = new Intl.DateTimeFormat('es', { hour: 'numeric', minute: '2-digit' });
    private queryTimer: ReturnType<typeof setTimeout> | undefined;

    readonly dayKeys = computed(() => {
        const now = this.now();
        return [sportsDayKey(new Date(now)), sportsDayKey(new Date(now + 86_400_000))];
    });

    readonly chips = computed<SportChip[]>(() => {
        const counts = sportCounts(this.events(), this.dayKeys()[this.day()]);
        const meta = this.meta();
        return Object.keys(meta)
            .filter((k) => counts[k])
            .map((k) => ({ key: k, label: meta[k].label, icon: meta[k].icon, count: counts[k] }));
    });

    readonly totalForDay = computed(() => this.chips().reduce((sum, c) => sum + c.count, 0));

    readonly liveEvents = computed(() =>
        this.events().filter(
            (e) => this.status(e) === 'live' && (!this.sport() || e.sp === this.sport())
        )
    );

    readonly showLiveRow = computed(
        () => this.liveEvents().length > 0 && this.day() === 0 && !this.query().trim()
    );

    readonly groups = computed(() => {
        const key = this.dayKeys()[this.day()];
        const hideLive = this.showLiveRow();
        const list = this.events().filter(
            (e) =>
                e.dayKey === key &&
                (!this.sport() || e.sp === this.sport()) &&
                matchesSportsQuery(e, this.query()) &&
                !(hideLive && this.status(e) === 'live')
        );
        return groupByLeague(list, this.meta());
    });

    constructor() {
        const tick = setInterval(() => this.now.set(Date.now()), 60_000);
        inject(DestroyRef).onDestroy(() => {
            clearInterval(tick);
            clearTimeout(this.queryTimer);
        });
    }

    async ngOnInit(): Promise<void> {
        const agenda = await this.data.loadAgenda();
        if (agenda) {
            this.meta.set({ ...DEFAULT_SPORTS_META, ...agenda.sports });
            this.events.set(toSportsCards(agenda.events));
        }
        // Nothing left today: open tomorrow, like the web player.
        const today = this.dayKeys()[0];
        if (this.events().length && !this.events().some((e) => e.dayKey === today)) {
            this.day.set(1);
        }
        this.loading.set(false);
    }

    selectDay(day: 0 | 1): void {
        this.day.set(day);
        this.sport.set('');
    }

    onQuery(value: string): void {
        clearTimeout(this.queryTimer);
        this.queryTimer = setTimeout(() => this.query.set(value.trim()), 150);
    }

    status(e: SportsCard): SportsEventStatus {
        return sportsEventStatus(e, this.meta(), this.now());
    }

    showScore(e: SportsCard): boolean {
        return hasScore(e, this.status(e));
    }

    time(e: SportsCard): string {
        return this.timeFormat.format(new Date(e.start));
    }

    leagueLabel(e: SportsCard): string {
        const m = this.meta()[e.sp];
        return `${m?.icon ?? ''} ${e.lg || m?.label || e.sp}`.trim();
    }

    initial(name: string): string {
        return (name || '?').charAt(0).toUpperCase();
    }

    /** TheSportsDB serves a /small variant; fall back to the original, then a letter. */
    onBadgeError(img: HTMLImageElement): void {
        if (!img.dataset['retry']) {
            img.dataset['retry'] = '1';
            img.src = img.src.replace(/\/small$/, '');
            return;
        }
        img.hidden = true;
        img.nextElementSibling?.removeAttribute('hidden');
    }

    async watch(e: SportsCard): Promise<void> {
        const st = this.status(e);
        const isToday = e.dayKey === this.dayKeys()[0];
        if (!isToday || st === 'fin' || st === 'pp') {
            this.toast(st === 'fin' && isToday ? 'Este evento ya terminó' : 'El evento no está en línea');
            return;
        }
        if (this.busyId()) return;
        this.busyId.set(e.id);
        try {
            const target = await this.data.findChannel(e);
            if (!target) {
                this.toast('No encontramos un canal para este evento');
                return;
            }
            if (target.partial) {
                this.toast(`Aún no aparece el canal exacto, te mostramos ${target.name}`);
                await this.router.navigate(['/workspace', 'xtreams', target.playlistId, 'live', target.categoryId]);
                return;
            }
            const nav = buildXtreamNavigationTarget({
                playlistId: target.playlistId,
                type: 'live',
                categoryId: target.categoryId,
                itemId: target.streamId,
                title: target.name,
            });
            await this.router.navigate(nav.link, { state: nav.state });
        } finally {
            this.busyId.set(null);
        }
    }

    private toast(message: string): void {
        this.snackBar.open(message, undefined, { duration: 3000 });
    }
}
