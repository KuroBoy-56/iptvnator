import { PanelProgressClient } from './panel-progress.client';
import {
    PanelFixtureLeague,
    PanelSportsAgenda,
    PanelSportsFixtures,
    PanelSportsTables,
    PanelSportsTeam,
    PanelStandingLeague,
} from './panel-sports.types';
import { SyncUserCredentials } from './panel-sync.types';

/** Sports from the panel (agenda, standings, 21-day fixtures, team card): the JSON the panel builds, never TheSportsDB. */

export async function sportsAgenda(client: PanelProgressClient, creds: SyncUserCredentials): Promise<PanelSportsAgenda | null> {
    const body = await client.postJson<Partial<PanelSportsAgenda>>('sports.php', creds, {});
    if (!body || !Array.isArray(body.events)) return null;
    return {
        events: body.events.filter((e) => e && e.id && e.ts),
        sports: body.sports && typeof body.sports === 'object' ? body.sports : {},
        match: body.match as PanelSportsAgenda['match'],
        tz: typeof body.tz === 'string' ? body.tz : undefined,
        tables: body.tables && typeof body.tables === 'object' ? body.tables : undefined,
        fixtures: body.fixtures && typeof body.fixtures === 'object' ? body.fixtures : undefined,
    };
}

export async function sportsTables(client: PanelProgressClient, creds: SyncUserCredentials): Promise<PanelSportsTables | null> {
    const body = await client.postJson<{ on?: boolean; p?: number; leagues?: PanelStandingLeague[] }>('sports_tables.php', creds, {});
    if (!body) return null;
    return {
        on: body.on !== false,
        partial: Number(body.p) === 1,
        leagues: Array.isArray(body.leagues) ? body.leagues.filter((l) => l && l.id && Array.isArray(l.g)) : [],
    };
}

export async function sportsFixtures(client: PanelProgressClient, creds: SyncUserCredentials): Promise<PanelSportsFixtures | null> {
    const body = await client.postJson<{ on?: boolean; p?: number; leagues?: Record<string, PanelFixtureLeague>; events?: PanelSportsFixtures['events'] }>(
        'sports_fixtures.php',
        creds,
        {}
    );
    if (!body) return null;
    return {
        on: body.on !== false,
        partial: Number(body.p) === 1,
        leagues: body.leagues && typeof body.leagues === 'object' ? body.leagues : {},
        events: Array.isArray(body.events) ? body.events.filter((e) => e && e.id && e.ts) : [],
    };
}

export async function sportsTeam(client: PanelProgressClient, creds: SyncUserCredentials, id: string): Promise<PanelSportsTeam | null> {
    const body = await client.postJson<PanelSportsTeam & { ok?: boolean }>('sports_team.php', creds, { id });
    return body?.ok ? body : null;
}
