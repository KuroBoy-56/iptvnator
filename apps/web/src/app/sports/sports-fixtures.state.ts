import { computed, signal } from '@angular/core';
import { PanelSportsFixtures, PanelSyncService } from '@iptvnator/services';
import { nationsMatches, recentTeams, rememberTeam, searchTeamMatches } from './sports-extra.util';
import { SportsCard, toSportsCards } from './sports-schedule.util';

/** Last fixtures read in this session (the panel builds them every 12 h). */
let saved: PanelSportsFixtures | null = null;

/**
 * Deportes › Equipos / Selecciones (as Roku, Vega and Android), over the panel's 21-day fixtures:
 * Equipos = a team (also in Spanish, with the panel's aliases) or a country and the last 5 searched;
 * Selecciones = all, each competition and «Selección femenina».
 */
export class SportsFixturesState {
    readonly data = signal<PanelSportsFixtures | null>(saved);
    readonly loading = signal(false);
    readonly query = signal('');
    readonly comp = signal('');
    readonly recents = signal<string[]>(recentTeams());
    private started = false;

    constructor(
        private readonly panel: PanelSyncService,
        private readonly ctx: {
            tz: () => string | undefined;
            alias: () => Record<string, string>;
            minutes: (sport: string) => number;
            now: () => number;
        }
    ) {}

    private readonly nations = computed(() => {
        const fx = this.data();
        return fx ? nationsMatches(fx, this.comp(), this.ctx.minutes, this.ctx.now()) : null;
    });

    /** Competition chips of Selecciones: [key, label or translation key]. */
    readonly nationChips = computed<[string, string][]>(() => {
        const fx = this.data();
        if (!fx) return [];
        const all = nationsMatches(fx, '', this.ctx.minutes, this.ctx.now());
        return [['', 'MPX.SPORTS.ALL_F'], ...all.chips, ...(all.women ? [['w', 'MPX.SPORTS.WOMEN_NAT'] as [string, string]] : [])];
    });

    readonly teamCards = computed<SportsCard[]>(() => {
        const fx = this.data();
        const q = this.query();
        if (!fx || !q) return [];
        return toSportsCards(searchTeamMatches(fx, q, this.ctx.alias(), this.ctx.minutes, this.ctx.now()), this.ctx.tz());
    });

    readonly nationCards = computed<SportsCard[]>(() => toSportsCards(this.nations()?.events ?? [], this.ctx.tz()));

    /** Loads once (the tab can open many times); while the panel is building it, asks again every 25 s. */
    async load(alive: () => boolean): Promise<void> {
        if (this.started) return;
        this.started = true;
        this.loading.set(!this.data());
        for (let tries = 0; tries < 12 && alive(); tries++) {
            const r = await this.panel.fetchSportsFixtures();
            if (r && (r.events.length || !this.data())) {
                saved = r;
                this.data.set(r);
            }
            this.loading.set(false);
            if (!r?.partial) return;
            await new Promise((ok) => setTimeout(ok, 25_000));
        }
    }

    search(q: string): void {
        const text = q.trim();
        this.query.set(text);
        if (text) this.recents.set(rememberTeam(text));
    }
}
