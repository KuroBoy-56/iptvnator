import { PanelSportMeta, PanelSportsEvent } from '@iptvnator/services';

export type SportsEventStatus = 'live' | 'fin' | 'pp' | 'soon';

/** Provider status texts that mean the match is over. */
const FINISHED = /^(FT|AET|AOT|PEN|Match Finished|Finished|After Over Time|Final)$/i;
const DEFAULT_MINUTES = 120;

/** Built-in sports (label = translation key); the panel's `sports` map overrides them. */
export const DEFAULT_SPORTS_META: Record<string, PanelSportMeta> = {
    Soccer: { label: 'MPX.SPORTS.SPORT_SOCCER', icon: '⚽', minutes: 120 },
    Basketball: { label: 'MPX.SPORTS.SPORT_BASKETBALL', icon: '🏀', minutes: 150 },
    'American Football': { label: 'MPX.SPORTS.SPORT_AMERICAN_FOOTBALL', icon: '🏈', minutes: 210 },
    Baseball: { label: 'MPX.SPORTS.SPORT_BASEBALL', icon: '⚾', minutes: 190 },
    Fighting: { label: 'MPX.SPORTS.SPORT_FIGHTING', icon: '🥊', minutes: 240 },
    Motorsport: { label: 'MPX.SPORTS.SPORT_MOTORSPORT', icon: '🏁', minutes: 150 },
    Tennis: { label: 'MPX.SPORTS.SPORT_TENNIS', icon: '🎾', minutes: 150 },
    'Ice Hockey': { label: 'MPX.SPORTS.SPORT_ICE_HOCKEY', icon: '🏒', minutes: 160 },
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

/** The panel zone when the runtime knows it, else undefined (= the device zone, as with an old panel). */
export function sportsZone(tz?: string): string | undefined {
    if (!tz) return undefined;
    try {
        new Intl.DateTimeFormat('en', { timeZone: tz });
        return tz;
    } catch {
        return undefined;
    }
}

/** Calendar day of `date` in the panel time zone (api/sports.php "tz"); the device zone without it. */
export function sportsDayKey(date: Date, tz?: string): string {
    const zone = sportsZone(tz);
    if (zone) {
        return new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
    }
    return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

export function toSportsCards(events: PanelSportsEvent[], tz?: string): SportsCard[] {
    return events
        .map((e) => {
            let start = Date.parse(e.ts);
            if (Number.isNaN(start)) start = Date.parse(String(e.ts).replace(' ', 'T'));
            return { ...e, start, dayKey: Number.isNaN(start) ? '' : sportsDayKey(new Date(start), tz) };
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

/** Lowercase, no accents, anything but [a-z0-9] -> space ("América" = "america", "ESPN-2" = "espn 2"). */
const foldText = (s: string) =>
    s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();

/** Teams, event, league, sport and the channels that broadcast it; every word must match ("america espn"). */
export function matchesSportsQuery(e: SportsCard, query: string): boolean {
    const words = foldText(query).split(' ').filter(Boolean);
    if (!words.length) return true;
    const hay = foldText([e.h, e.a, e.ev, e.lg, e.sp, ...(e.tv ?? []).map((t) => t.n)].join(' '));
    return words.every((w) => hay.includes(w));
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
