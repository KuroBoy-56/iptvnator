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
