import { ElectronBridgeApi, whenPlaybackClosed } from '@iptvnator/shared/interfaces';

/** Última orden «borrar caché» del panel ya aplicada: el propio borrado nunca la toca. */
export const CACHE_CLEAR_SEEN_KEY = 'cache_clear_seen';
/** Evento de ventana: AppComponent muestra el aviso. */
export const PANEL_CACHE_CLEAR_EVENT = 'panel-cache-clear';
/** Tiempo del aviso antes de borrar y reiniciar. */
export const CACHE_CLEAR_NOTICE_MS = 3000;

export type CacheClearAction = 'none' | 'remember' | 'clear';

/** Una orden más nueva que esto se aplica aunque la app no tenga nada guardado (como Roku, Vega y Android). */
export const CACHE_CLEAR_RECENT_S = 3 * 86400;

/**
 * Decisión ante el cache_clear de check_mac: uno mayor que el guardado borra; igual,
 * menor o ausente (panel viejo) no hace nada. Sin valor guardado (instalada de nuevo,
 * datos borrados) una orden de los últimos 3 días (cache_clear_at = cuándo se envió)
 * borra igual; una más vieja solo se guarda (antes se guardaba siempre en silencio y
 * la orden recién enviada no hacía nada).
 */
export function cacheClearAction(seen: number | null, received: unknown, at: unknown = 0, now = Date.now() / 1000): CacheClearAction {
    if (received === null || received === undefined || received === '') return 'none';
    const id = Number(received);
    if (!Number.isFinite(id) || id < 0) return 'none';
    if (seen === null) {
        const sent = Number(at) || 0;
        return id > 0 && sent > 0 && now - sent < CACHE_CLEAR_RECENT_S ? 'clear' : 'remember';
    }
    return Math.floor(id) > seen ? 'clear' : 'none';
}

export function readCacheClearSeen(): number | null {
    try {
        const raw = localStorage.getItem(CACHE_CLEAR_SEEN_KEY);
        const id = raw === null ? NaN : Number(raw);
        return Number.isFinite(id) && id >= 0 ? id : null;
    } catch {
        return null;
    }
}

function saveCacheClearSeen(id: number): boolean {
    try {
        localStorage.setItem(CACHE_CLEAR_SEEN_KEY, String(id));
        return true;
    } catch {
        return false;
    }
}

async function clearAndRestart(): Promise<void> {
    const electron = (window as unknown as { electron?: Partial<ElectronBridgeApi> }).electron;
    try {
        if (electron?.panelClearCacheAndRestart) {
            await electron.panelClearCacheAndRestart();
            return;
        }
    } catch {
        // el proceso principal no pudo: al menos se recarga
    }
    location.reload();
}

/**
 * Aplica el cache_clear de check_mac (at = cache_clear_at). true = la app va a avisar,
 * borrar su caché y reiniciarse (quien llamó no debe seguir). Con un video abierto
 * (reproductor de la app, MPV embebido, MPV/VLC externo) espera a que se cierre: el
 * reinicio cortaba la película.
 */
export function applyCacheClearOrder(received: unknown, at: unknown = 0): boolean {
    const action = cacheClearAction(readCacheClearSeen(), received, at);
    if (action === 'none') return false;
    // se guarda primero para no repetir el borrado en bucle; sin almacenamiento no se borra nada
    if (!saveCacheClearSeen(Math.floor(Number(received))) || action === 'remember') return false;
    void whenPlaybackClosed().then(() => {
        globalThis.dispatchEvent?.(new CustomEvent(PANEL_CACHE_CLEAR_EVENT));
        setTimeout(() => void clearAndRestart(), CACHE_CLEAR_NOTICE_MS);
    });
    return true;
}
