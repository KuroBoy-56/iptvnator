import { normalizeSportsText } from './sports-matcher';
import { SportsLiveCategory, SportsLiveStream } from './panel-sports.types';

/**
 * Canal del partido por la guía del panel (api/sports_epg.php), como Vega, Roku e iOS: la app manda sus canales
 * deportivos (hasta 600, primero los que tienen guía propia, sin las carpetas de eventos) y el panel responde qué
 * canales tienen el partido en su programación a esa hora: {"map": {"<idEvent>": ["<stream_id>", …]}}.
 */
export interface SportsEpgChannel {
    id: string;
    epg: string;
    name: string;
}

const SPORT_RE =
    /sport|deport|espn|fox|tnt|tudn|dazn|bein|sky|movistar|futbol|soccer|nba|nfl|mlb|nhl|ufc|liga|win |directv|dsports|claro|vix|paramount|peacock|tyc|gol|telemundo|univision|azteca|canal 5|caracol|rcn|tsn|eurosport|teledeporte|cbs|nbc|usa network|f1|golf|tenis|tennis|box|universo|sportsnet|telefe|tv publica|teletica|tigo|max|apple tv/;

const MAX_CHANNELS = 600;

/** Los canales deportivos que se le mandan al panel (eventRe: carpetas de eventos, que se dejan fuera). */
export function sportsEpgChannels(
    streams: readonly (SportsLiveStream & { epg_channel_id?: string | null })[],
    categories: readonly SportsLiveCategory[],
    eventRe: RegExp | null
): SportsEpgChannel[] {
    const sportCats = new Set<string>();
    const eventCats = new Set<string>();
    for (const c of categories) {
        const n = normalizeSportsText(c.category_name);
        if (eventRe?.test(n)) eventCats.add(String(c.category_id));
        else if (SPORT_RE.test(n)) sportCats.add(String(c.category_id));
    }
    const withEpg: SportsEpgChannel[] = [];
    const noEpg: SportsEpgChannel[] = [];
    for (const st of streams) {
        if (!st?.stream_id) continue;
        const cat = String(st.category_id ?? '');
        if (eventCats.has(cat)) continue;
        if (!sportCats.has(cat) && !SPORT_RE.test(normalizeSportsText(String(st.name ?? '')))) continue;
        const ch = { id: String(st.stream_id), epg: String(st.epg_channel_id ?? '').trim(), name: String(st.name ?? '') };
        (ch.epg ? withEpg : noEpg).push(ch);
        if (withEpg.length >= MAX_CHANNELS) break;
    }
    return withEpg.concat(noEpg).slice(0, MAX_CHANNELS);
}

/** Respuesta del panel -> partido: ids de canal. */
export function parseSportsEpgMap(body: unknown): Record<string, string[]> {
    const map = (body as { map?: unknown } | null)?.map;
    const out: Record<string, string[]> = {};
    if (!map || typeof map !== 'object') return out;
    for (const [k, v] of Object.entries(map as Record<string, unknown>)) {
        if (Array.isArray(v)) out[k] = v.map((x) => String(x));
    }
    return out;
}
