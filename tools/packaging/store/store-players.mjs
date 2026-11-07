// MPV y VLC integrados (carpeta bin/ en la raíz del proyecto; extraResources la copia completa a resources/bin).
// Antes de compilar se comprueba que estén y, después, que el paquete los lleve completos (mismos archivos y bytes).
import fs from 'node:fs';
import path from 'node:path';

export const REQUIRED_PLAYER_FILES = [
    'mpv/mpv.exe',
    'vlc/vlc.exe',
    'vlc/libvlc.dll',
    'vlc/libvlccore.dll',
    'vlc/plugins',
];
// presentes en el VLC portable de Windows; si faltan solo se avisa (vlc.exe no los necesita para reproducir)
export const OPTIONAL_PLAYER_FILES = ['vlc/axvlc.dll', 'vlc/npvlc.dll', 'vlc/locale'];

/** {count, bytes} de todos los archivos bajo dir (recursivo) */
export function folderStats(dir) {
    let count = 0;
    let bytes = 0;
    if (!fs.existsSync(dir)) return { count, bytes };
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            const sub = folderStats(full);
            count += sub.count;
            bytes += sub.bytes;
        } else if (entry.isFile()) {
            count += 1;
            bytes += fs.statSync(full).size;
        }
    }
    return { count, bytes };
}

/** {missing: [...], optionalMissing: [...], stats} de la carpeta bin del proyecto */
export function checkPlayerBinaries(binDir) {
    const missing = REQUIRED_PLAYER_FILES.filter((f) => !fs.existsSync(path.join(binDir, f)));
    const optionalMissing = OPTIONAL_PLAYER_FILES.filter((f) => !fs.existsSync(path.join(binDir, f)));
    return { missing, optionalMissing, stats: folderStats(binDir) };
}

/** Compara bin/ del proyecto con resources/bin del paquete armado (win-unpacked). [] = completo */
export function comparePackagedPlayers(sourceBin, packagedBin) {
    const errors = [];
    for (const f of REQUIRED_PLAYER_FILES) {
        if (!fs.existsSync(path.join(packagedBin, f))) errors.push(`falta ${f} en el paquete`);
    }
    const src = folderStats(sourceBin);
    const out = folderStats(packagedBin);
    if (src.count !== out.count || src.bytes !== out.bytes) {
        errors.push(`bin/ tiene ${src.count} archivos (${src.bytes} bytes) y el paquete ${out.count} (${out.bytes} bytes)`);
    }
    return errors;
}

export function formatMb(bytes) {
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
