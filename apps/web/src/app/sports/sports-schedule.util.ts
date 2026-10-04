import { PanelSportMeta, PanelSportsEvent } from '@iptvnator/services';

export type SportsEventStatus = 'live' | 'fin' | 'pp' | 'soon';

/** Provider status texts that mean the match is over. */
const FINISHED = /^(FT|AET|AOT|PEN|Match Finished|Finished|After Over Time|Final)$/i;
const DEFAULT_MINUTES = 120;

/** Built-in sport labels; the panel's `sports` map overrides them. */
export const DEFAULT_SPORTS_META: Record<string, PanelSportMeta> = {
    Soccer: { label: 'Fútbol', icon: '⚽', minutes: 120 },
    Basketball: { label: 'Baloncesto', icon: '🏀', minutes: 150 },
    'American Football': { label: 'Fútbol americano', icon: '🏈', minutes: 210 },
    Baseball: { label: 'Béisbol', icon: '⚾', minutes: 190 },
    Fighting: { label: 'Combate', icon: '🥊', minutes: 240 },
    Motorsport: { label: 'Motor', icon: '🏁', minutes: 150 },
    Tennis: { label: 'Tenis', icon: '🎾', minutes: 150 },
    'Ice Hockey': { label: 'Hockey', icon: '🏒', minutes: 160 },
};

export interface SportsCard extends PanelSportsEvent {
    start: number;
    dayKey: string;
}

export interface SportsLeagueGroup {
    name: string;
    badge: string;
    items: SportsCard[];
}

export function sportsDayKey(date: Date): string {
    return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

export function toSportsCards(events: PanelSportsEvent[]): SportsCard[] {
    return events
        .map((e) => {
            let start = Date.parse(e.ts);
            if (Number.isNaN(start)) start = Date.parse(String(e.ts).replace(' ', 'T'));
            return { ...e, start, dayKey: Number.isNaN(start) ? '' : sportsDayKey(new Date(start)) };
        })
        .filter((e) => e.dayKey !== '');
}

export function sportsEventStatus(
    e: SportsCard,
    meta: Record<string, PanelSportMeta>,
    now = Date.now()
): SportsEventStatus {
    const duration = (meta[e.sp]?.minutes || DEFAULT_MINUTES) * 60_000;
    if (e.pp) return 'pp';
    if (FINISHED.test(e.st || '')) return 'fin';
    if (now >= e.start && now < e.start + duration) return 'live';
    if (now >= e.start + duration) return 'fin';
    return 'soon';
}

export function hasScore(e: SportsCard, status: SportsEventStatus): boolean {
    const set = (v: unknown) => v !== null && v !== undefined && v !== '';
    return status !== 'soon' && set(e.hs) && set(e.as);
}

export function matchesSportsQuery(e: SportsCard, query: string): boolean {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return `${e.h} ${e.a} ${e.lg} ${e.ev}`.toLowerCase().includes(q);
}

export function groupByLeague(
    events: SportsCard[],
    meta: Record<string, PanelSportMeta>
): SportsLeagueGroup[] {
    const groups = new Map<string, SportsLeagueGroup>();
    for (const e of events) {
        const name = e.lg || meta[e.sp]?.label || e.sp;
        let group = groups.get(name);
        if (!group) {
            group = { name, badge: e.lb, items: [] };
            groups.set(name, group);
        }
        group.items.push(e);
    }
    return [...groups.values()];
}

export function sportCounts(events: SportsCard[], dayKey: string): Record<string, number> {
    const counts: Record<string, number> = {};
    for (const e of events) {
        if (e.dayKey === dayKey) counts[e.sp] = (counts[e.sp] ?? 0) + 1;
    }
    return counts;
}
