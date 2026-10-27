import { PanelSportsFixtures } from '@iptvnator/services';
import { divisionOf, nationsMatches, recentTeams, regionOf, rememberTeam, searchTeamMatches, tinyBadge } from './sports-extra.util';

const NOW = Date.parse('2026-10-27T12:00:00Z');
const at = (h: number) => new Date(NOW + h * 3_600_000).toISOString();
const ev = (id: string, l: string, h: string, a: string, hours: number) => ({
    id, l, sp: 'Soccer', lg: '', lb: '', ev: `${h} vs ${a}`, h, a, hb: '', ab: '', hs: null, as: null, ts: at(hours), v: '', st: '', th: '', pp: false,
});

const fx: PanelSportsFixtures = {
    on: true,
    partial: false,
    leagues: {
        '1': { n: 'LaLiga', b: '', sp: 'Soccer', c: 'Spain', rg: 'eu', w: 0 },
        '2': { n: 'Eliminatorias', b: '', sp: 'Soccer', c: '', rg: 'nat', w: 0 },
        '3': { n: 'Mundial Femenino', b: '', sp: 'Soccer', c: '', rg: 'nat', w: 1 },
    },
    events: [
        ev('a', '1', 'Real Madrid', 'Barcelona', 30),
        ev('b', '2', 'Germany', 'Mexico', 50),
        ev('c', '2', 'Argentina', 'Brazil', -0.5),
        ev('d', '2', 'Spain', 'Italy', -5),
        ev('e', '3', 'Spain Women', 'USA Women', 70),
    ],
};
const minutes = () => 120;
// the panel's aliases go from the provider's (English) name to the Spanish one
const alias = { germany: 'alemania', spain: 'espana' };

describe('sports extra (Tablas, Equipos, Selecciones)', () => {
    it('groups regions and divisions like Roku, Vega and Android', () => {
        expect(regionOf({ rg: 'latam' })).toBe('am');
        expect(regionOf({ rg: 'na' })).toBe('am');
        expect(regionOf({ rg: 'eu' })).toBe('eu');
        expect(regionOf({ rg: 'asia' })).toBe('world');
        expect(divisionOf({ w: 1, d: 1 })).toBe(10);
        expect(divisionOf({ w: 0, d: 0 })).toBe(1);
        expect(tinyBadge('https://r2.thesportsdb.com/images/a.png')).toBe('https://r2.thesportsdb.com/images/a.png/tiny');
    });

    it('finds a team in Spanish with the panel aliases, every word, and skips ended matches', () => {
        expect(searchTeamMatches(fx, 'Alemania', alias, minutes, NOW).map((e) => e.id)).toEqual(['b']);
        expect(searchTeamMatches(fx, 'real madrid', alias, minutes, NOW).map((e) => e.id)).toEqual(['a']);
        expect(searchTeamMatches(fx, 'Italy', alias, minutes, NOW)).toEqual([]);
        expect(searchTeamMatches(fx, '  ', alias, minutes, NOW)).toEqual([]);
    });

    it('a country brings its national team and its leagues', () => {
        expect(searchTeamMatches(fx, 'España', alias, minutes, NOW).map((e) => e.id)).toEqual(['a']);
        expect(searchTeamMatches(fx, 'Spain', alias, minutes, NOW).map((e) => e.id)).toEqual(['a', 'e']);
    });

    it('national teams: live first, competitions as chips and the women chip apart', () => {
        const all = nationsMatches(fx, '', minutes, NOW);
        expect(all.events.map((e) => e.id)).toEqual(['c', 'b', 'e']);
        expect(all.chips).toEqual([['2', 'Eliminatorias']]);
        expect(all.women).toBe(true);
        expect(nationsMatches(fx, 'w', minutes, NOW).events.map((e) => e.id)).toEqual(['e']);
        expect(nationsMatches(fx, '2', minutes, NOW).events.map((e) => e.id)).toEqual(['c', 'b']);
    });

    it('keeps the last 5 teams searched, newest first, without repeating', () => {
        localStorage.clear();
        for (const q of ['a', 'b', 'c', 'd', 'e', 'f', 'B']) rememberTeam(q);
        expect(recentTeams()).toEqual(['B', 'f', 'e', 'd', 'c']);
    });
});
