import { app, session } from 'electron';
import * as schema from '@iptvnator/shared/database/schema';
import { getDatabase } from '../database/connection';

/**
 * Orden «borrar caché» del panel: borra todo lo que se vuelve a descargar y
 * reinicia la app. Se quedan las playlists (la línea), favoritos/progreso
 * locales que no dependen del catálogo, las descargas y el almacenamiento del
 * renderer (sesión session_*, distribuidor, ajustes, cache_clear_seen).
 */
export async function clearRedownloadableCache(): Promise<void> {
    const ses = session.defaultSession;
    // caché HTTP (pósters, imágenes, respuestas) y Cache Storage; nunca localStorage
    await Promise.all([
        ses.clearCache(),
        ses.clearStorageData({ storages: ['cachestorage', 'shadercache'] }),
    ]).catch((e) => console.error('[panel] clear cache:', e));
    try {
        const db = await getDatabase();
        // content arrastra (cascade) sus filas de favoritos/recientes: los favoritos vuelven del panel
        db.transaction((tx) => {
            tx.delete(schema.content).run();
            tx.delete(schema.categories).run();
            tx.delete(schema.epgPrograms).run();
            tx.delete(schema.epgChannels).run();
            tx.delete(schema.tmdbMetadata).run();
        });
    } catch (e) {
        // base ocupada o dañada: igual se reinicia, la app sigue funcionando con lo que haya
        console.error('[panel] clear database cache:', e);
    }
}

/** Lo más parecido a un arranque en frío: nuevo proceso y salida del actual. */
export async function clearCacheAndRestart(): Promise<void> {
    await clearRedownloadableCache();
    app.relaunch();
    app.exit(0);
}
