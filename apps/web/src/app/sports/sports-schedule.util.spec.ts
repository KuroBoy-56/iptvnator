import { PanelSportsEvent } from '@iptvnator/services';
import {
    DEFAULT_SPORTS_META,
    groupByLeague,
    hasScore,
    matchesSportsQuery,
    sportCounts,
    sportsDayKey,
    sportsEventStatus,
    toSportsCards,
} from './sports-schedule.util';

const base: PanelSportsEvent = {
    id: '1',
    sp: 'Soccer',
    lg: 'La Liga',
    lb: '',
    ev: 'Real Madrid vs Getafe',
    h: 'Real Madrid',
    a: 'Getafe',
    hb: '',
    ab: '',
    hs: null,
    as: null,
    ts: '2026-10-04T18:00:00Z',
    v: '',
    st: '',
    th: '',
    pp: false,
};

describe('sports schedule utils', () => {
    const [card] = toSportsCards([base]);
    const start = Date.parse(base.ts);

    it('parses timestamps into cards with a local day key', () => {
        expect(card.start).toBe(start);
        expect(card.dayKey).toBe(sportsDayKey(new Date(start)));
        expect(toSportsCards([{ ...base, ts: 'nope' }])).toEqual([]);
    });

    it('derives soon, live, final and postponed states', () => {
        expect(sportsEventStatus(card, DEFAULT_SPORTS_META, start - 1)).toBe('soon');
        expect(sportsEventStatus(card, DEFAULT_SPORTS_META, start + 60_000)).toBe('live');
        expect(sportsEventStatus(card, DEFAULT_SPORTS_META, start + 121 * 60_000)).toBe('fin');
        expect(sportsEventStatus({ ...card, st: 'Match Finished' }, DEFAULT_SPORTS_META, start)).toBe('fin');
        expect(sportsEventStatus({ ...card, pp: true }, DEFAULT_SPORTS_META, start)).toBe('pp');
    });

    it('shows scores only after kick-off when both are set', () => {
        expect(hasScore({ ...card, hs: 1, as: 0 }, 'live')).toBe(true);
        expect(hasScore({ ...card, hs: 1, as: 0 }, 'soon')).toBe(false);
        expect(hasScore({ ...card, hs: '', as: 0 }, 'fin')).toBe(false);
    });

    it('filters by query and groups by league with counts per sport', () => {
        const other = { ...card, id: '2', sp: 'Tennis', lg: '' };
        expect(matchesSportsQuery(card, 'getafe')).toBe(true);
        expect(matchesSportsQuery(card, 'boca')).toBe(false);
        const groups = groupByLeague([card, other], DEFAULT_SPORTS_META);
        expect(groups.map((g) => g.name)).toEqual(['La Liga', 'Tenis']);
        expect(sportCounts([card, other], card.dayKey)).toEqual({ Soccer: 1, Tennis: 1 });
    });
});
