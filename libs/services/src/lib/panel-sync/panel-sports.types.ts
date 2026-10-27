/** One match from the panel agenda (api/sports.php, TheSportsDB fields). */
export interface PanelSportsEvent {
    id: string;
    /** Sport key, e.g. "Soccer". */
    sp: string;
    /** League name and badge. */
    lg: string;
    lb: string;
    /** Event title, used when there are no teams (races, fights). */
    ev: string;
    /** Home/away team names and badges. */
    h: string;
    a: string;
    hb: string;
    ab: string;
    /** Scores (null before kick-off). */
    hs: string | number | null;
    as: string | number | null;
    /** ISO start timestamp. */
    ts: string;
    /** Venue and provider status text. */
    v: string;
    st: string;
    th: string;
    /** Postponed. */
    pp: boolean;
    /** Channels that broadcast it (region first), when the panel knows them. */
    tv?: PanelSportsTv[];
}

/** A broadcast channel of a match: name and country, e.g. { n: 'ESPN 2', c: 'México' }. */
export interface PanelSportsTv {
    n: string;
    c: string;
}

export interface PanelSportMeta {
    label: string;
    icon: string;
    /** Typical duration, used to decide when a match is live. */
    minutes: number;
}

export interface SportsMatchScoring {
    fullName: number;
    token: number;
    teamWeight: number;
    bothTeamsBonus: number;
    leagueBonus: number;
    eventCategoryBonus: number;
    singleTokenWeight: number;
}

/** Rules the panel publishes to find the live channel that carries a match. */
export interface SportsMatchRules {
    stop: string[];
    alias: Record<string, string>;
    eventCategory: string;
    scoring: SportsMatchScoring;
}

export interface PanelSportsAgenda {
    events: PanelSportsEvent[];
    sports: Record<string, PanelSportMeta>;
    match: SportsMatchRules;
    /** Panel time zone (the distributor's or the owner's, IANA name): match hours and Today/Tomorrow use it. */
    tz?: string;
    /** Standings tab (api/sports_tables.php): on, and the version of the panel's JSON. */
    tables?: { on: boolean; t?: number };
    /** Teams / National teams tabs (api/sports_fixtures.php): on, version and whether national teams are chosen. */
    fixtures?: { on: boolean; t?: number; nat?: boolean };
}

/** One row of a standings table (api/sports_tables.php). z: zone p/s/o/r; f: last results (W/D/L). */
export interface PanelStandingRow {
    id: string;
    r: number;
    t: string;
    b: string;
    p: number;
    w: number;
    d: number;
    l: number;
    gf: number;
    ga: number;
    gd: number;
    pts: number;
    f: string;
    z: string;
}

/** A league or cup: rg region, d division, w women's league, g groups of rows. */
export interface PanelStandingLeague {
    id: string;
    n: string;
    c: string;
    b: string;
    sp: string;
    sl: string;
    d: number;
    rg: string;
    w: number;
    s: string;
    g: { n: string; r: PanelStandingRow[] }[];
}

export interface PanelSportsTables {
    on: boolean;
    /** The panel is still building it ("p": 1): show what there is and ask again. */
    partial: boolean;
    leagues: PanelStandingLeague[];
}

/** A league of the 21-day fixtures (rg 'nat' = national teams, w = women). */
export interface PanelFixtureLeague {
    n: string;
    b: string;
    sp: string;
    c: string;
    rg: string;
    w: number;
}

/** Next 21 days of the chosen leagues (api/sports_fixtures.php); events carry l = league id. */
export interface PanelSportsFixtures {
    on: boolean;
    partial: boolean;
    leagues: Record<string, PanelFixtureLeague>;
    events: (PanelSportsEvent & { l?: string })[];
}

/** Team card (api/sports_team.php, in the app language). */
export interface PanelSportsTeam {
    n: string;
    b: string;
    y: string;
    loc: string;
    c: string;
    st: string;
    cap: number;
    lg: string;
    hon: { t: string; n: number }[];
    d: string;
}

/** Minimal live stream / category shape the matcher needs. */
export interface SportsLiveStream {
    stream_id: number | string;
    name: string;
    category_id?: string | number | null;
    stream_icon?: string;
}

export interface SportsLiveCategory {
    category_id: string | number;
    category_name: string;
}

export interface SportsChannelMatch {
    streamId: string;
    categoryId: string;
    name: string;
    /** No exact channel: this is the first event category instead. */
    partial: boolean;
}
