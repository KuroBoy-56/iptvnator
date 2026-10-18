import { ElectronBridgeApi } from '@iptvnator/shared/interfaces';

/** Última orden «borrar caché» del panel ya aplicada: el propio borrado nunca la toca. */
export const CACHE_CLEAR_SEEN_KEY = 'cache_clear_seen';
/** Evento de ventana: AppComponent muestra el aviso. */
export const PANEL_CACHE_CLEAR_EVENT = 'panel-cache-clear';
/** Tiempo del aviso antes de borrar y reiniciar. */
export const CACHE_CLEAR_NOTICE_MS = 3000;

export type CacheClearAction = 'none' | 'remember' | 'clear';

/**
 * Decisión ante el cache_clear de check_mac: sin valor guardado (primera vez /
 * app recién actualizada) solo se guarda; uno mayor que el guardado borra; igual,
 * menor o ausente (panel viejo) no hace nada.
 */
export function cacheClearAction(seen: number | null, received: unknown): CacheClearAction {
    if (received === null || received === undefined || received === '') return 'none';
    const id = Number(received);
    if (!Number.isFinite(id) || id < 0) return 'none';
    if (seen === null) return 'remember';
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
 * Aplica el cache_clear de check_mac. true = la app está avisando, borrando su
 * caché y reiniciándose (quien llamó no debe seguir).
 */
export function applyCacheClearOrder(received: unknown): boolean {
    const action = cacheClearAction(readCacheClearSeen(), received);
    if (action === 'none') return false;
    // se guarda primero para no repetir el borrado en bucle; sin almacenamiento no se borra nada
    if (!saveCacheClearSeen(Math.floor(Number(received))) || action === 'remember') return false;
    globalThis.dispatchEvent?.(new CustomEvent(PANEL_CACHE_CLEAR_EVENT));
    setTimeout(() => void clearAndRestart(), CACHE_CLEAR_NOTICE_MS);
    return true;
}
