import { parseSportsEpgMap, sportsEpgChannels } from './sports-epg';

describe('sports EPG (canal del partido por la guía del panel)', () => {
    it('manda solo canales deportivos, primero los que tienen guía y sin carpetas de eventos', () => {
        const categories = [
            { category_id: 1, category_name: 'MX | Deportes' },
            { category_id: 2, category_name: 'Eventos PPV' },
            { category_id: 3, category_name: 'Noticias' },
        ];
        const streams = [
            { stream_id: 10, name: 'TUDN', category_id: 1 },
            { stream_id: 11, name: 'ESPN 2 HD', category_id: 1, epg_channel_id: 'espn2.mx' },
            { stream_id: 12, name: 'Evento 1', category_id: 2, epg_channel_id: 'x' },
            { stream_id: 13, name: 'CNN', category_id: 3, epg_channel_id: 'cnn' },
            { stream_id: 14, name: 'Fox Sports 3', category_id: 3 },
        ];
        expect(sportsEpgChannels(streams, categories, /event|ppv/i)).toEqual([
            { id: '11', epg: 'espn2.mx', name: 'ESPN 2 HD' },
            { id: '10', epg: '', name: 'TUDN' },
            { id: '14', epg: '', name: 'Fox Sports 3' },
        ]);
    });

    it('lee el mapa del panel', () => {
        expect(parseSportsEpgMap({ map: { '99': [11, '10'] } })).toEqual({ '99': ['11', '10'] });
        expect(parseSportsEpgMap(null)).toEqual({});
    });
});
