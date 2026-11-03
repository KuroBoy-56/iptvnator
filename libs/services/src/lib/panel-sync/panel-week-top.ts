import { Injectable, signal } from '@angular/core';
import { panelEndpoint, tenantStorageSuffix, withPanelLang, withTenantQuery } from '@iptvnator/shared/interfaces';

/**
 * Top 10 de la semana, igual que Roku, Vega, Android, iOS y las TV: el panel (api/top10.php) manda lo más popular de
 * la semana en TMDB; aquí se cruza con el catálogo por título y año (±1) y lo que falte se completa con lo mejor
 * calificado, distinto cada semana (también sin clave de TMDB). Se guarda por distribuidor y se pide otra vez cada 12 h.
 */
export interface WeekTopEntry {
    /** true = serie, false = película, undefined = no lo dice (listas de un solo tipo) */
    series?: boolean;
    /** título en español (es-MX) */
    t: string;
    /** título original */
    o: string;
    /** año (0 = no se sabe) */
    y: number;
}

export interface WeekTopLists {
    movies: WeekTopEntry[];
    series: WeekTopEntry[];
    all: WeekTopEntry[];
}

/** Lo que el cruce necesita de cada título del catálogo. */
export interface WeekTopItem {
    title: string;
    year?: string;
    rating?: string | number;
}

const EMPTY: WeekTopLists = { movies: [], series: [], all: [] };
const AGE_MS = 12 * 3600 * 1000;
const STORAGE_KEY = 'panel_week_top';

// ---------- títulos comparables (como Roku / Android / iOS: sin "| LAT", (2019), [4K], acentos, signos ni etiquetas) ----------

const TAGS = new Set([
    '4k', 'uhd', 'fhd', 'hd', 'sd', 'lat', 'latino', 'sub', 'subt', 'esp', 'castellano', 'dual', 'spa', 'eng',
    '1080p', '720p', '2160p', 'hdr', 'cam', 'ts', 'multi', 'vose', 'subtitulado', 'hevc', 'x264', 'x265',
]);

export function weekTitleKey(name: string): string {
    let t = (name ?? '').trim().replace(/^[A-Z]{2,3}\s*[-|:]\s+/, '');
    for (const sep of ['|', ' - ', ' – ']) {
        const p = t.indexOf(sep);
        if (p > 0) t = t.slice(0, p);
    }
    t = t
        .replace(/\([^)]*\)|\[[^\]]*\]|\{[^}]*\}/g, ' ')
        .normalize('NFD')
        .replace(/\p{M}+/gu, '')
        .toLowerCase();
    return t
        .split(/[^a-z0-9]+/)
        .filter((w) => w && !TAGS.has(w) && !(w.length === 4 && /^(19|20)\d\d$/.test(w)))
        .join(' ');
}

function yearOf(it: WeekTopItem): number {
    const y = Number(String(it.year ?? '').slice(0, 4));
    if (y > 1900) return y;
    const m = /[([]((?:19|20)\d\d)[)\]]/.exec(it.title ?? '');
    return m ? Number(m[1]) : 0;
}

function ratingOf(it: WeekTopItem): number {
    const r = Number(it.rating);
    return Number.isFinite(r) ? r : 0;
}

/** posiciones del catálogo que están en la lista de la semana, en su orden (sin repetir) */
export function weekMatches<T extends WeekTopItem>(list: WeekTopEntry[], items: T[], n: number): T[] {
    if (!list.length || !items.length) return [];
    const idx = new Map<string, T[]>();
    for (const it of items) {
        const k = weekTitleKey(it.title);
        if (!k) continue;
        const l = idx.get(k);
        if (l) l.push(it);
        else idx.set(k, [it]);
    }
    const out: T[] = [];
    for (const e of list) {
        for (const name of [e.t, e.o]) {
            if (!name) continue;
            const hit = idx.get(weekTitleKey(name))?.find((c) => {
                const cy = yearOf(c);
                return !out.includes(c) && (!e.y || !cy || Math.abs(e.y - cy) <= 1);
            });
            if (hit) {
                out.push(hit);
                break;
            }
        }
        if (out.length >= n) break;
    }
    return out;
}

/** número de la semana del año (ISO): el relleno cambia cada semana */
export function isoWeek(d = new Date()): number {
    const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    const day = t.getUTCDay() || 7;
    t.setUTCDate(t.getUTCDate() + 4 - day);
    const y0 = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
    return t.getUTCFullYear() * 100 + Math.ceil(((t.getTime() - y0.getTime()) / 86400000 + 1) / 7);
}

/** orden al azar fijo por semana (el mismo toda la semana, otro la siguiente) */
export function weekShuffle<T>(list: T[], salt: number, week = isoWeek()): T[] {
    let s = (week * 2654435761 + salt) >>> 0;
    const rnd = () => {
        s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
        return s / 4294967296;
    };
    const a = list.slice();
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(rnd() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}

/** relleno: de los 40 mejor calificados, unos distintos cada semana (ordenados por calificación) */
function weekFill<T extends WeekTopItem>(items: T[], skip: T[], n: number, salt: number): T[] {
    if (n <= 0) return [];
    const pool = [...items].sort((a, b) => ratingOf(b) - ratingOf(a)).filter((i) => !skip.includes(i)).slice(0, 40);
    const pick = new Set(weekShuffle(pool, salt).slice(0, n));
    return pool.filter((i) => pick.has(i));
}

/** Top 10 de Películas o de Series: lo de la semana que está en el catálogo y el relleno de la semana. */
export function weekTop10<T extends WeekTopItem>(lists: WeekTopLists, items: T[], series: boolean): T[] {
    const got = weekMatches(series ? lists.series : lists.movies, items, 10);
    return [...got, ...weekFill(items, got, 10 - got.length, series ? 2 : 1)];
}

/** Top 10 de Inicio: películas y series juntas, alternadas en el orden de la semana. */
export function weekTop10Home<T extends WeekTopItem>(lists: WeekTopLists, movies: T[], series: T[]): T[] {
    const mv = weekMatches(lists.all.filter((e) => e.series !== true), movies, 10);
    const sv = weekMatches(lists.all.filter((e) => e.series === true), series, 10);
    const out: T[] = [];
    for (let a = 0, b = 0; out.length < 10 && (a < mv.length || b < sv.length); ) {
        if (a < mv.length) out.push(mv[a++]);
        if (out.length < 10 && b < sv.length) out.push(sv[b++]);
    }
    const need = 10 - out.length;
    if (need > 0) {
        const fill = [...weekFill(movies, mv, need, 3), ...weekFill(series, sv, need, 4)];
        out.push(...weekShuffle(fill, 5).slice(0, need));
    }
    return out;
}

function entries(v: unknown): WeekTopEntry[] {
    return (Array.isArray(v) ? v : [])
        .slice(0, 80)
        .map((x: Record<string, unknown>) => ({
            series: x?.['k'] === 's' ? true : x?.['k'] === 'm' ? false : undefined,
            t: String(x?.['t'] ?? '').trim(),
            o: String(x?.['o'] ?? '').trim(),
            y: Number(x?.['y']) || 0,
        }))
        .filter((e) => e.t || e.o);
}

export function parseWeekTop(body: unknown): WeekTopLists | null {
    if (!body || typeof body !== 'object' || !('movies' in body)) return null;
    const j = body as Record<string, unknown>;
    return { movies: entries(j['movies']), series: entries(j['series']), all: entries(j['all']) };
}

/**
 * La lista de la semana del panel, guardada por distribuidor (al abrir la app la fila sale al instante). `rev` cambia
 * cuando llega una lista distinta: Inicio, Películas y Series rehacen su fila.
 */
@Injectable({ providedIn: 'root' })
export class PanelWeekTopService {
    readonly lists = signal<WeekTopLists>(EMPTY);
    private at = 0;
    private loadedFor: string | null = null;
    private asking: Promise<void> | null = null;

    /** reemplazable en las pruebas */
    fetchFn: typeof fetch = (...args) => fetch(...args);

    private get key(): string {
        return STORAGE_KEY + tenantStorageSuffix();
    }

    private restore(): void {
        if (this.loadedFor === this.key) return;
        this.loadedFor = this.key;
        this.at = 0;
        let lists = EMPTY;
        try {
            const saved = JSON.parse(localStorage.getItem(this.key) ?? 'null') as { at?: number; data?: unknown } | null;
            const parsed = saved ? parseWeekTop(saved.data) : null;
            if (parsed) {
                lists = parsed;
                this.at = Number(saved?.at) || 0;
            }
        } catch {
            /* storage blocked or bad JSON */
        }
        this.lists.set(lists);
    }

    /** pide la lista si la guardada tiene más de 12 h (no hace nada si es reciente) */
    load(now = Date.now()): Promise<void> {
        this.restore();
        if (now - this.at < AGE_MS) return Promise.resolve();
        if (this.asking) return this.asking;
        this.asking = (async () => {
            try {
                const res = await this.fetchFn(withTenantQuery(withPanelLang(panelEndpoint('top10.php'))));
                const body = res.ok ? await res.json().catch(() => null) : null;
                const parsed = parseWeekTop(body);
                if (!parsed) return;
                this.at = now;
                try {
                    localStorage.setItem(this.key, JSON.stringify({ at: now, data: body }));
                } catch {
                    /* storage blocked */
                }
                if (JSON.stringify(parsed) !== JSON.stringify(this.lists())) this.lists.set(parsed);
            } catch {
                /* panel sin respuesta: queda lo guardado */
            } finally {
                this.asking = null;
            }
        })();
        return this.asking;
    }
}
