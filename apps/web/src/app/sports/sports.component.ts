import {
    ChangeDetectionStrategy,
    Component,
    computed,
    DestroyRef,
    inject,
    OnInit,
    signal,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { MatSnackBar } from '@angular/material/snack-bar';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { map } from 'rxjs';
import { NgTemplateOutlet } from '@angular/common';
import { Router } from '@angular/router';
import { DEFAULT_SPORTS_MATCH_RULES, PanelSportMeta, PanelSyncService } from '@iptvnator/services';
import { buildXtreamNavigationTarget } from '@iptvnator/portal/shared/util';
import { SportsDataService, SportsWatchMode } from './sports-data.service';
import { SportsTab } from './sports-extra.util';
import { SportsFixturesState } from './sports-fixtures.state';
import { SportsTablesComponent } from './sports-tables.component';
import {
    DEFAULT_SPORTS_META,
    groupByLeague,
    hasScore,
    matchesSportsQuery,
    SportsCard,
    sportCounts,
    sportsDayKey,
    sportsZone,
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
    imports: [NgTemplateOutlet, TranslatePipe, SportsTablesComponent],
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SportsComponent implements OnInit {
    private readonly data = inject(SportsDataService);
    private readonly router = inject(Router);
    private readonly snackBar = inject(MatSnackBar);
    private readonly translate = inject(TranslateService);
    private readonly lang = toSignal(this.translate.onLangChange.pipe(map((e) => e.lang)), {
        initialValue: this.translate.currentLang || this.translate.defaultLang,
    });

    readonly loading = signal(true);
    readonly events = signal<SportsCard[]>([]);
    /** Sports of the panel agenda (its labels come in the app language). */
    private readonly panelMeta = signal<Record<string, PanelSportMeta>>({});
    /** Built-in sport labels in the app language, overridden by the panel's. */
    readonly meta = computed<Record<string, PanelSportMeta>>(() => {
        this.lang();
        const local: Record<string, PanelSportMeta> = {};
        for (const [key, m] of Object.entries(DEFAULT_SPORTS_META)) {
            local[key] = { ...m, label: this.translate.instant(m.label) };
        }
        return { ...local, ...this.panelMeta() };
    });
    readonly day = signal<0 | 1>(0);
    readonly sport = signal('');
    readonly query = signal('');
    readonly now = signal(Date.now());
    readonly busyId = signal<string | null>(null);
    /** Event whose "where to watch" menu is open. */
    readonly menuId = signal<string | null>(null);
    /** Panel time zone (api/sports.php "tz"): hours and Today/Tomorrow follow the panel, not the computer. */
    private readonly tz = signal<string | undefined>(undefined);
    private readonly timeFormat = computed(
        () =>
            new Intl.DateTimeFormat(this.lang() || 'es', {
                hour: 'numeric',
                minute: '2-digit',
                timeZone: sportsZone(this.tz()),
            })
    );
    private queryTimer: ReturnType<typeof setTimeout> | undefined;
    private alive = true;

    /** Agenda / Tablas / Selecciones / Equipos (the last three when the panel offers them, as Roku, Vega and Android). */
    readonly tab = signal<SportsTab>('agenda');
    private readonly extra = signal<{ tables: boolean; nations: boolean; teams: boolean }>({ tables: false, nations: false, teams: false });
    private readonly alias = signal<Record<string, string>>({});
    readonly tabs = computed<{ key: SportsTab; label: string }[]>(() => {
        const x = this.extra();
        const list: { key: SportsTab; label: string }[] = [{ key: 'agenda', label: 'MPX.SPORTS.TAB_SCHEDULE' }];
        if (x.tables) list.push({ key: 'tables', label: 'MPX.SPORTS.TAB_TABLES' });
        if (x.nations) list.push({ key: 'nations', label: 'MPX.SPORTS.TAB_NATIONS' });
        if (x.teams) list.push({ key: 'teams', label: 'MPX.SPORTS.TAB_TEAMS' });
        return list.length > 1 ? list : [];
    });
    readonly fixtures = new SportsFixturesState(inject(PanelSyncService), {
        tz: () => this.tz(),
        alias: () => this.alias(),
        minutes: (sp) => this.meta()[sp]?.minutes || 120,
        now: () => this.now(),
    });
    private readonly dateFormat = computed(
        () => new Intl.DateTimeFormat(this.lang() || 'es', { weekday: 'short', day: 'numeric', month: 'short', timeZone: sportsZone(this.tz()) })
    );

    readonly dayKeys = computed(() => {
        const now = this.now();
        return [sportsDayKey(new Date(now), this.tz()), sportsDayKey(new Date(now + 86_400_000), this.tz())];
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
            this.alive = false;
            clearInterval(tick);
            clearTimeout(this.queryTimer);
        });
    }

    async ngOnInit(): Promise<void> {
        const agenda = await this.data.loadAgenda();
        if (agenda) {
            this.panelMeta.set(agenda.sports ?? {});
            this.tz.set(agenda.tz);
            this.events.set(toSportsCards(agenda.events, agenda.tz));
            this.alias.set(agenda.match?.alias ?? DEFAULT_SPORTS_MATCH_RULES.alias);
            this.extra.set({
                tables: agenda.tables?.on === true,
                nations: agenda.fixtures?.on === true && agenda.fixtures?.nat === true,
                teams: agenda.fixtures?.on === true,
            });
        }
        // Nothing left today: open tomorrow, like the web player.
        const today = this.dayKeys()[0];
        if (this.events().length && !this.events().some((e) => e.dayKey === today)) {
            this.day.set(1);
        }
        this.loading.set(false);
    }

    selectTab(tab: SportsTab): void {
        this.tab.set(tab);
        this.menuId.set(null);
        if (tab === 'nations' || tab === 'teams') void this.fixtures.load(() => this.alive);
    }

    /** Teams / National teams: the match day too (the next 21 days); today only the hour. */
    when(e: SportsCard): string {
        return e.dayKey === this.dayKeys()[0] ? this.time(e) : `${this.dateFormat().format(new Date(e.start))} · ${this.time(e)}`;
    }

    /** Equipos: filters while typing; Enter keeps it in the last searched. */
    onTeamQuery(value: string): void {
        clearTimeout(this.queryTimer);
        this.queryTimer = setTimeout(() => this.fixtures.query.set(value.trim()), 250);
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
        return this.timeFormat().format(new Date(e.start));
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

    tvLine(e: SportsCard): string {
        const tv = e.tv ?? [];
        if (!tv.length) return '';
        const names = tv.slice(0, 4).map((t) => t.n).join(' · ') + (tv.length > 4 ? `  +${tv.length - 4}` : '');
        return this.translate.instant('MPX.SPORTS.ON_TV', { channels: names });
    }

    /** With broadcast channels: the menu (watch, each channel, by teams); without: straight to the search. */
    open(e: SportsCard): void {
        if (e.tv?.length) this.menuId.set(this.menuId() === e.id ? null : e.id);
        else void this.watch(e);
    }

    async watch(e: SportsCard, mode: SportsWatchMode = { kind: 'auto' }): Promise<void> {
        this.menuId.set(null);
        const st = this.status(e);
        const isToday = e.dayKey === this.dayKeys()[0];
        if (!isToday || st === 'fin' || st === 'pp') {
            this.toast(st === 'fin' && isToday ? 'MPX.SPORTS.ENDED' : 'MPX.SPORTS.NOT_LIVE');
            return;
        }
        if (this.busyId()) return;
        this.busyId.set(e.id);
        try {
            const target = await this.data.findChannel(e, mode);
            if (!target) {
                if (mode.kind === 'tv') this.toast('MPX.SPORTS.NO_TV_CHANNEL', { name: mode.name });
                else this.toast('MPX.SPORTS.NO_CHANNEL');
                return;
            }
            if (target.missing) this.toast('MPX.SPORTS.MISSING_CHANNEL', { missing: target.missing, name: target.name });
            if (target.partial) {
                this.toast('MPX.SPORTS.PARTIAL_CHANNEL', { name: target.name });
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

    private toast(key: string, params?: Record<string, string>): void {
        this.snackBar.open(this.translate.instant(key, params), undefined, { duration: 3000 });
    }
}
