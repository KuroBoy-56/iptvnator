import {
    PanelSportsEvent,
    SportsChannelMatch,
    SportsLiveCategory,
    SportsLiveStream,
    SportsMatchRules,
} from './panel-sports.types';

/** Used when the panel response has no rules (same values the panel sends). */
export const DEFAULT_SPORTS_MATCH_RULES: SportsMatchRules = {
    stop: [
        'fc', 'cf', 'sc', 'ac', 'cd', 'ca', 'club', 'de', 'del', 'la', 'el', 'los', 'las',
        'the', 'and', 'vs', 'v', 'city', 'united', 'real', 'sporting', 'atletico',
        'deportivo', 'union', 'women', 'femenil', 'w', 'u20', 'u21', 'u23', 'sub',
    ],
    alias: {},
    eventCategory: 'event|ppv|pay per view|deportes? en vivo|live sport|partidos? (de )?hoy',
    scoring: {
        fullName: 2,
        token: 1,
        teamWeight: 10,
        bothTeamsBonus: 15,
        leagueBonus: 3,
        eventCategoryBonus: 6,
        singleTokenWeight: 8,
    },
};

/** Lowercase, strip accents, anything outside [a-z0-9] becomes one space. */
export function normalizeSportsText(value: string | null | undefined): string {
    return String(value ?? '')
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, ' ')
        .trim();
}

export function sportsTokens(value: string, rules: SportsMatchRules): string[] {
    const stop = new Set(rules.stop);
    return normalizeSportsText(value)
        .split(' ')
        .filter((t) => t.length >= 3 && !stop.has(t));
}

function sportsAlias(name: string, rules: SportsMatchRules): string[] {
    const n = normalizeSportsText(name);
    const alias = rules.alias[n];
    return alias ? [n, alias] : [n];
}

function hasWord(haystack: string, word: string): boolean {
    return ` ${haystack} `.includes(` ${word} `);
}

/** 0 = absent, `token` = a distinctive word matches, `fullName` = whole name. */
export function sportsTeamScore(channel: string, team: string, rules: SportsMatchRules): number {
    if (!team.trim()) return 0;
    let best = 0;
    for (const n of sportsAlias(team, rules)) {
        if (n.length >= 3 && hasWord(channel, n)) return rules.scoring.fullName;
        for (const t of sportsTokens(n, rules)) {
            if (t.length >= 4 && hasWord(channel, t)) best = rules.scoring.token;
        }
    }
    return best;
}

function mergeRules(rules?: Partial<SportsMatchRules> | null): SportsMatchRules {
    const d = DEFAULT_SPORTS_MATCH_RULES;
    return {
        stop: Array.isArray(rules?.stop) ? rules.stop : d.stop,
        alias: rules?.alias && typeof rules.alias === 'object' ? rules.alias : d.alias,
        eventCategory: rules?.eventCategory || d.eventCategory,
        scoring: { ...d.scoring, ...(rules?.scoring ?? {}) },
    };
}

/**
 * Finds the user's live channel for a match with the panel's rules (the web
 * player's sp_find_channel). Falls back to the first event category.
 */
export function findSportsChannel(
    event: Pick<PanelSportsEvent, 'h' | 'a' | 'lg' | 'ev'>,
    streams: SportsLiveStream[],
    categories: SportsLiveCategory[],
    panelRules?: Partial<SportsMatchRules> | null
): SportsChannelMatch | null {
    const rules = mergeRules(panelRules);
    const s = rules.scoring;
    let eventRe: RegExp | null = null;
    try {
        eventRe = new RegExp(rules.eventCategory, 'i');
    } catch {
        eventRe = null;
    }
    const eventCats = new Map<string, string>();
    for (const c of categories) {
        if (eventRe?.test(normalizeSportsText(c.category_name))) {
            eventCats.set(String(c.category_id), c.category_name);
        }
    }

    const home = event.h ?? '';
    const away = event.a ?? '';
    const withTeams = home !== '' || away !== '';
    const leagueToks = sportsTokens(event.lg ?? '', rules);
    const single = withTeams ? [] : sportsTokens(event.ev ?? '', rules);
    let best: { score: number; stream: SportsLiveStream } | null = null;

    for (const st of streams) {
        if (!st?.stream_id) continue;
        const isEv = eventCats.has(String(st.category_id ?? ''));
        const chan = normalizeSportsText(st.name);
        let score: number;
        if (withTeams) {
            const hs = sportsTeamScore(chan, home, rules);
            const as = sportsTeamScore(chan, away, rules);
            if (!hs && !as) continue;
            // Outside event folders both teams must appear ("Real Madrid TV").
            if (!isEv && !(hs && as)) continue;
            // "Real Madrid vs Barcelona" is not "Real Madrid vs Getafe".
            if (!(hs && as) && / (vs|v|x) /.test(` ${chan} `)) continue;
            score = hs * s.teamWeight + as * s.teamWeight + (hs && as ? s.bothTeamsBonus : 0);
        } else {
            const hit = single.filter((t) => hasWord(chan, t)).length;
            if (!hit || (!isEv && hit < 2)) continue;
            score = hit * s.singleTokenWeight;
        }
        if (leagueToks.some((t) => hasWord(chan, t))) score += s.leagueBonus;
        if (isEv) score += s.eventCategoryBonus;
        if (!best || score > best.score) best = { score, stream: st };
    }

    if (best) {
        return {
            streamId: String(best.stream.stream_id),
            categoryId: String(best.stream.category_id ?? ''),
            name: String(best.stream.name ?? ''),
            partial: false,
        };
    }
    const first = eventCats.entries().next();
    if (!first.done) {
        return { streamId: '', categoryId: first.value[0], name: first.value[1], partial: true };
    }
    return null;
}
