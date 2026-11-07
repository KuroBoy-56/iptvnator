// Configuración de Electron Builder para el paquete AppX de Microsoft Store, armada a partir de la del EXE
// (electron-builder.json, que NO se toca) más electron-builder.store.json y la identidad de Partner Center.
//
// Por qué no basta con `extends`: Electron Builder 26 junta las listas al heredar (deepAssign concatena arrays), así
// que win.target quedaría NSIS + AppX y se generarían los dos. Aquí las listas del archivo de la Store REEMPLAZAN a las
// del EXE y el resultado se escribe ya resuelto (sin `extends`) en dist/store-config/.
import fs from 'node:fs';
import path from 'node:path';

export const STORE_OVERLAY_PATH = 'electron-builder.store.json';
export const STORE_RESOLVED_PATH = path.join('dist', 'store-config', 'electron-builder.store.resolved.json');
export const STORE_OUTPUT_DIR = path.join('dist', 'store');

// Secciones del EXE / otras plataformas que no aplican a un AppX de Windows
const NOT_FOR_STORE = ['mac', 'dmg', 'linux', 'snap', 'flatpak', 'nsis', 'squirrelWindows', 'msi', 'portable'];

function isPlainObject(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/** Mezcla profunda donde las listas y los valores simples del segundo objeto reemplazan a los del primero. */
export function mergeReplacingArrays(base, overlay) {
    const out = isPlainObject(base) ? { ...base } : {};
    for (const [key, value] of Object.entries(overlay ?? {})) {
        out[key] = isPlainObject(value) && isPlainObject(out[key]) ? mergeReplacingArrays(out[key], value) : value;
    }
    return out;
}

/**
 * Configuración final del AppX.
 * @param baseConfig   electron-builder.json (EXE)
 * @param overlay      electron-builder.store.json
 * @param extraMetadata la de generate-electron-builder-metadata.mjs (versión sincronizada con package.json)
 * @param identity     {identityName, publisher, publisherDisplayName, applicationId}
 */
export function buildStoreConfig({ baseConfig, overlay, extraMetadata, identity }) {
    const { extends: _ignored, ...overlayRest } = overlay ?? {};
    let config = mergeReplacingArrays(baseConfig, overlayRest);
    for (const key of NOT_FOR_STORE) delete config[key];
    config = mergeReplacingArrays(config, {
        extraMetadata: { ...(baseConfig.extraMetadata ?? {}), ...(extraMetadata ?? {}) },
        appx: identity,
    });
    // ya resuelta: Electron Builder no debe volver a heredar de nada (ni buscar electron-builder.json)
    config.extends = null;
    // sin actualizador ni app-update.yml: las actualizaciones de la versión Store las hace Microsoft Store
    config.publish = null;
    return config;
}

/** Lo que debe cumplir la configuración resuelta (se comprueba antes de compilar y en las pruebas). */
export function checkStoreConfig(config) {
    const errors = [];
    const targets = config.win?.target ?? [];
    const list = Array.isArray(targets) ? targets : [targets];
    const names = list.map((t) => (typeof t === 'string' ? t : t?.target));
    if (names.length !== 1 || names[0] !== 'appx') errors.push(`win.target debe ser solo appx (es ${JSON.stringify(names)})`);
    const archs = list.flatMap((t) => (typeof t === 'object' && t?.arch ? [].concat(t.arch) : []));
    if (archs.length !== 1 || archs[0] !== 'x64') errors.push(`la arquitectura inicial debe ser solo x64 (es ${JSON.stringify(archs)})`);
    if (config.appId === 'com.fourgray.iptvnator' && !config.appx?.identityName) errors.push('falta la identidad AppX');
    const bin = (config.extraResources ?? []).find((r) => isPlainObject(r) && r.from === 'bin');
    if (!bin || bin.to !== 'bin') errors.push('extraResources debe copiar la carpeta bin completa (MPV y VLC)');
    if (config.nsis) errors.push('la configuración de la Store no debe llevar NSIS');
    if (config.publish !== null) errors.push('publish debe ser null (sin actualizador)');
    for (const field of ['identityName', 'publisher', 'publisherDisplayName', 'applicationId']) {
        if (!config.appx?.[field]) errors.push(`appx.${field} vacío`);
    }
    return errors;
}

export function readJson(file) {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
}

export function writeResolvedStoreConfig(workspaceRoot, config) {
    const file = path.join(workspaceRoot, STORE_RESOLVED_PATH);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, `${JSON.stringify(config, null, 4)}\n`);
    return file;
}
