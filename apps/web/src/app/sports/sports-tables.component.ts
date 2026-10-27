import { ChangeDetectionStrategy, Component, computed, DestroyRef, inject, OnInit, signal } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { PanelStandingLeague, PanelStandingRow, PanelSportsTeam, PanelSyncService } from '@iptvnator/services';
import { divisionOf, regionOf, SPORTS_REGIONS, tinyBadge, WOMEN_DIVISION } from './sports-extra.util';

/** Last standings read in this session (the panel builds them once a day): the tab opens at once the next time. */
let saved: PanelStandingLeague[] | null = null;

const ZONES = ['p', 's', 'o', 'r'] as const;

/**
 * Deportes › Tablas (as Roku, Vega and Android): region, division and league of the panel's standings; clicking a
 * team opens its card (api/sports_team.php) with «Entendido» and «Más detalles». While the panel is still building
 * them ("p": 1) what there is shows and it asks again every 20 s.
 */
@Component({
    selector: 'app-sports-tables',
    imports: [TranslatePipe],
    changeDetection: ChangeDetectionStrategy.OnPush,
    styleUrl: './sports-tables.component.scss',
    template: `
        @if (!leagues().length) {
            <div class="sp-empty">
                <b>{{ (loading() ? 'MPX.SPORTS.TABLES_LOADING' : partial() ? 'MPX.SPORTS.TABLES_PREPARING' : failed() ? 'MPX.SPORTS.TABLES_FAILED' : 'MPX.SPORTS.NO_TABLES') | translate }}</b>
            </div>
        } @else {
            @if (regions().length > 1) {
                <div class="sp-chips">
                    @for (r of regions(); track r) {
                        <button type="button" class="sp-chip" [class.active]="region() === r" (click)="pickRegion(r)">{{ regionLabel(r) | translate }}</button>
                    }
                </div>
            }
            @if (divisions().length > 1) {
                <div class="sp-chips">
                    @for (d of divisions(); track d) {
                        <button type="button" class="sp-chip" [class.active]="division() === d" (click)="pickDivision(d)">
                            {{ d === women ? ('MPX.SPORTS.WOMEN_LEAGUE' | translate) : ('MPX.SPORTS.DIVISION' | translate: { n: d }) }}
                        </button>
                    }
                </div>
            }
            <div class="sp-chips">
                @for (lg of list(); track lg.id) {
                    <button type="button" class="sp-chip" [class.active]="league()?.id === lg.id" (click)="leagueId.set(lg.id)">{{ lg.n }}</button>
                }
            </div>
            @if (league(); as lg) {
                <div class="st-title">
                    @if (lg.b) {
                        <img [src]="tiny(lg.b)" alt="" (error)="$any($event.target).remove()" />
                    }
                    <h2>{{ lg.n }}{{ lg.s ? ' · ' + lg.s : '' }}</h2>
                </div>
                @for (g of lg.g; track $index) {
                    @if (lg.g.length > 1 || g.n) {
                        <h3 class="st-group">{{ g.n }}</h3>
                    }
                    <table class="st-table">
                        <thead>
                            <tr>
                                <th class="rk">#</th>
                                <th class="tm"></th>
                                @for (c of cols; track c) {
                                    <th [class]="'n c-' + c">{{ 'MPX.SPORTS.COL_' + c | translate }}</th>
                                }
                                <th class="fm"></th>
                            </tr>
                        </thead>
                        <tbody>
                            @for (r of g.r; track r.r + r.t) {
                                <tr [class.link]="!!r.id" (click)="openTeam(r)">
                                    <td class="rk"><i [class]="'z z-' + r.z"></i>{{ r.r }}</td>
                                    <td class="tm">
                                        @if (r.b) {
                                            <img [src]="tiny(r.b)" alt="" loading="lazy" (error)="$any($event.target).remove()" />
                                        }
                                        <span>{{ r.t }}</span>
                                    </td>
                                    @for (c of cols; track c) {
                                        <td [class]="'n c-' + c">{{ cell(r, c) }}</td>
                                    }
                                    <td class="fm">
                                        @for (f of form(r); track $index) {
                                            <i [class]="'f f-' + f"></i>
                                        }
                                    </td>
                                </tr>
                            }
                        </tbody>
                    </table>
                }
                <div class="st-legend">
                    @for (z of zones(); track z) {
                        <span><i [class]="'z z-' + z"></i>{{ 'MPX.SPORTS.ZONE_' + z.toUpperCase() | translate }}</span>
                    }
                </div>
            }
        }

        @if (card(); as c) {
            <div class="st-shade" (click)="card.set(null)">
                <div class="st-card" role="dialog" (click)="$event.stopPropagation()">
                    <div class="st-card-head">
                        @if (c.team?.b || c.row.b) {
                            <img [src]="tiny(c.team?.b || c.row.b)" alt="" />
                        }
                        <h2>{{ c.team?.n || c.row.t }}</h2>
                    </div>
                    <div class="st-card-body">
                        @if (!c.team) {
                            <p class="mute">{{ (c.done ? 'MPX.SPORTS.NO_TEAM_INFO' : 'MPX.SPORTS.TABLES_LOADING') | translate }}</p>
                        } @else {
                            @for (f of facts(c.team); track $index) {
                                <p>{{ f.key | translate: f.params }}</p>
                            }
                            @if (titles(c.team); as t) {
                                @if (c.full) {
                                    <p><b>{{ 'MPX.SPORTS.TITLES_HEAD' | translate: { n: t.total } }}</b></p>
                                    @for (h of c.team.hon; track $index) {
                                        <p class="mute">• {{ h.t }} ×{{ h.n }}</p>
                                    }
                                } @else {
                                    <p class="mute">{{ 'MPX.SPORTS.TITLES' | translate: { n: t.total, list: t.short } }}</p>
                                }
                            }
                            @if (c.team.d) {
                                <p class="mute desc" [class.full]="c.full">{{ c.team.d }}</p>
                            }
                        }
                    </div>
                    <div class="st-card-foot">
                        @if (c.team && !c.full) {
                            <button type="button" class="ghost" (click)="card.set({ row: c.row, team: c.team, done: true, full: true })">{{ 'MPX.SPORTS.MORE_DETAILS' | translate }}</button>
                        }
                        <button type="button" class="primary" (click)="card.set(null)">{{ 'MPX.SPORTS.UNDERSTOOD' | translate }}</button>
                    </div>
                </div>
            </div>
        }
    `,
})
export class SportsTablesComponent implements OnInit {
    private readonly panel = inject(PanelSyncService);
    private readonly destroyRef = inject(DestroyRef);

    readonly women = WOMEN_DIVISION;
    readonly cols = ['P', 'W', 'D', 'L', 'GF', 'GA', 'GD', 'PTS'] as const;
    readonly leagues = signal<PanelStandingLeague[]>(saved ?? []);
    readonly loading = signal(!saved);
    readonly partial = signal(false);
    readonly failed = signal(false);
    readonly region = signal('');
    readonly division = signal(1);
    readonly leagueId = signal('');
    readonly card = signal<{ row: PanelStandingRow; team: PanelSportsTeam | null; done: boolean; full: boolean } | null>(null);

    readonly regions = computed(() => {
        const all = this.leagues();
        const found = SPORTS_REGIONS.filter((k) => all.some((l) => regionOf(l) === k));
        return found.length > 1 ? ['', ...found] : [''];
    });
    readonly divisions = computed(() => {
        const all = this.leagues();
        return Array.from({ length: WOMEN_DIVISION }, (_, i) => i + 1).filter((d) => all.some((l) => divisionOf(l) === d));
    });
    private readonly div = computed(() => {
        const divs = this.divisions();
        return divs.length < 2 ? 0 : divs.includes(this.division()) ? this.division() : divs[0];
    });
    readonly list = computed(() =>
        this.leagues().filter((l) => (!this.region() || regionOf(l) === this.region()) && (!this.div() || divisionOf(l) === this.div()))
    );
    readonly league = computed(() => this.list().find((l) => l.id === this.leagueId()) ?? this.list()[0] ?? null);
    readonly zones = computed(() => {
        // (the web app's lib has no flatMap)
        const used = new Set<string>();
        for (const g of this.league()?.g ?? []) for (const r of g.r) used.add(r.z);
        return ZONES.filter((z) => used.has(z));
    });

    async ngOnInit(): Promise<void> {
        let alive = true;
        this.destroyRef.onDestroy(() => (alive = false));
        // still being built on the panel: what there is, and again every 20 s (up to 4 min)
        for (let tries = 0; tries < 12 && alive; tries++) {
            const r = await this.panel.fetchSportsTables();
            if (!alive) return;
            if (r?.leagues.length) {
                saved = r.leagues;
                this.leagues.set(r.leagues);
            }
            this.partial.set(!!r?.partial);
            this.failed.set(!r);
            this.loading.set(false);
            if (!r?.partial) return;
            await new Promise((ok) => setTimeout(ok, 20_000));
        }
    }

    pickRegion(r: string): void {
        this.region.set(r);
        this.leagueId.set('');
    }

    pickDivision(d: number): void {
        this.division.set(d);
        this.leagueId.set('');
    }

    regionLabel(r: string): string {
        return r ? `MPX.SPORTS.REGION_${r.toUpperCase()}` : 'MPX.SPORTS.ALL_F';
    }

    tiny(url: string): string {
        return tinyBadge(url);
    }

    cell(r: PanelStandingRow, c: (typeof this.cols)[number]): number {
        return { P: r.p, W: r.w, D: r.d, L: r.l, GF: r.gf, GA: r.ga, GD: r.gd, PTS: r.pts }[c];
    }

    form(r: PanelStandingRow): string[] {
        return (r.f || '').split('').filter((x) => 'WDL'.includes(x));
    }

    async openTeam(row: PanelStandingRow): Promise<void> {
        if (!row.id) return;
        this.card.set({ row, team: null, done: false, full: false });
        const team = await this.panel.fetchSportsTeam(row.id);
        if (this.card()?.row === row) this.card.set({ row, team, done: true, full: false });
    }

    facts(t: PanelSportsTeam): { key: string; params?: Record<string, string> }[] {
        const place = [t.loc, t.c].filter(Boolean).join(', ');
        const out: { key: string; params?: Record<string, string> }[] = [];
        if (t.y) out.push({ key: 'MPX.SPORTS.FOUNDED', params: { year: t.y + (place ? ' · ' + place : '') } });
        else if (place) out.push({ key: 'MPX.SPORTS.PLAIN', params: { text: place } });
        if (t.st) out.push({ key: 'MPX.SPORTS.STADIUM', params: { name: t.st + (t.cap > 0 ? ` (${t.cap})` : '') } });
        if (t.lg) out.push({ key: 'MPX.SPORTS.LEAGUE', params: { name: t.lg } });
        return out;
    }

    titles(t: PanelSportsTeam): { total: number; short: string } | null {
        const hon = Array.isArray(t.hon) ? t.hon : [];
        const total = hon.reduce((sum, h) => sum + (Number(h.n) || 0), 0);
        return total > 0 ? { total, short: hon.slice(0, 5).map((h) => `${h.t} ×${h.n}`).join(' · ') } : null;
    }
}
