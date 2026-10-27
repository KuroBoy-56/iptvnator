import {
    normalizeSportsText,
    PanelSportsFixtures,
    PanelStandingLeague,
} from '@iptvnator/services';

/**
 * Standings, Teams and National teams (same rules as Roku, Vega and Android): regions and divisions of the panel's
 * leagues, the team search over the 21-day fixtures and the national teams list.
 */
export type SportsTab = 'agenda' | 'tables' | 'nations' | 'teams';

/** Region chips in order ('' = all). */
export const SPORTS_REGIONS = ['intl', 'nat', 'eu', 'am', 'world'] as const;
/** Women's leagues go in their own "division" chip after the numbered ones. */
export const WOMEN_DIVISION = 10;

/** America joins Latin, North and South America (older panels sent them apart). */
export function regionOf(lg: Pick<PanelStandingLeague, 'rg'>): string {
    if (['latam', 'na', 'sa', 'us', 'am'].includes(lg.rg)) return 'am';
    return lg.rg === 'intl' || lg.rg === 'nat' || lg.rg === 'eu' ? lg.rg : 'world';
}

export function divisionOf(lg: Pick<PanelStandingLeague, 'w' | 'd'>): number {
    return lg.w === 1 ? WOMEN_DIVISION : Math.max(1, Number(lg.d) || 1);
}

/** TheSportsDB badges have a light /tiny variant. */
export function tinyBadge(url: string): string {
    return url.includes('thesportsdb.com/') && !url.endsWith('/tiny') ? `${url}/tiny` : url;
}

type FixtureEvent = PanelSportsFixtures['events'][number];

function ended(e: FixtureEvent, minutes: (sport: string) => number, now: number): boolean {
    const start = Date.parse(e.ts);
    return !Number.isNaN(start) && now >= start + minutes(e.sp) * 60_000;
}

/** Name comparable with the panel's aliases (also in Spanish: «Alemania» = «Germany»). */
function teamText(name: string, alias: Record<string, string>): string {
    const n = normalizeSportsText(name);
    if (!n) return '';
    const a = alias[n];
    return a && a !== n ? `${n} ${a}` : n;
}

/**
 * By team (every word in the home or away team, also in Spanish) or by country (the whole country: its national
 * team and the matches of that country's leagues). Only matches that did not end, up to 80.
 */
export function searchTeamMatches(
    fx: PanelSportsFixtures,
    query: string,
    alias: Record<string, string>,
    minutes: (sport: string) => number,
    now = Date.now()
): FixtureEvent[] {
    const q = normalizeSportsText(query);
    const words = q.split(' ').filter(Boolean);
    if (!words.length) return [];
    const countryLeagues = new Set(
        Object.entries(fx.leagues)
            .filter(([, l]) => {
                const c = teamText(l.c, alias);
                return !!c && ` ${c} `.includes(` ${q} `);
            })
            .map(([id]) => id)
    );
    const out: FixtureEvent[] = [];
    for (const e of fx.events) {
        const teams = !e.h && !e.a ? [normalizeSportsText(e.ev)] : [teamText(e.h, alias), teamText(e.a, alias)];
        const hit = (!!e.l && countryLeagues.has(e.l)) || teams.some((t) => !!t && words.every((w) => t.includes(w)));
        if (hit && !ended(e, minutes, now)) {
            out.push(e);
            if (out.length >= 80) break;
        }
    }
    return out;
}

export interface NationsView {
    events: FixtureEvent[];
    /** Men's competitions: [league id, name]. */
    chips: [string, string][];
    /** There are women's matches («Selección femenina» chip, comp "w"). */
    women: boolean;
}

/** National teams ("nat" leagues) live or upcoming, live first; comp '' = all, 'w' = every women's competition. */
export function nationsMatches(fx: PanelSportsFixtures, comp: string, minutes: (sport: string) => number, now = Date.now()): NationsView {
    const live: FixtureEvent[] = [];
    const next: FixtureEvent[] = [];
    const chips: [string, string][] = [];
    const have = new Set<string>();
    let women = false;
    for (const e of fx.events) {
        const lid = e.l ?? '';
        const info = lid ? fx.leagues[lid] : undefined;
        if (!info || info.rg !== 'nat' || ended(e, minutes, now)) continue;
        if (info.w === 1) women = true;
        else if (!have.has(lid)) {
            have.add(lid);
            chips.push([lid, info.n]);
        }
        if (!comp || comp === e.l || (comp === 'w' && info.w === 1)) {
            if (Date.parse(e.ts) <= now) live.push(e);
            else if (next.length < 150) next.push(e);
        }
    }
    return { events: [...live, ...next], chips, women };
}

const RECENT_KEY = 'sports_team_recent';

/** Last 5 teams searched (newest first). */
export function recentTeams(): string[] {
    try {
        const list = JSON.parse(localStorage.getItem(RECENT_KEY) || '[]');
        return Array.isArray(list) ? list.filter((x) => typeof x === 'string' && x.trim()).slice(0, 5) : [];
    } catch {
        return [];
    }
}

export function rememberTeam(q: string): string[] {
    const out = [q, ...recentTeams().filter((x) => x.toLowerCase() !== q.toLowerCase())].slice(0, 5);
    try {
        localStorage.setItem(RECENT_KEY, JSON.stringify(out));
    } catch {
        // without storage nothing is remembered
    }
    return out;
}
