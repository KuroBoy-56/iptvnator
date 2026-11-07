import * as os from 'os';

/**
 * Microsoft Store (AppX / MSIX): la app queda instalada en C:\Program Files\WindowsApps\…, que es de solo lectura.
 * MPV y VLC arrancan bien desde ahí (la app es de plena confianza, runFullTrust), pero heredaban ese directorio de
 * trabajo: capturas, registros u otros archivos con ruta relativa no se podían escribir. En el paquete de la Store se
 * abren con la carpeta del usuario como directorio de trabajo; su configuración y caché siguen en %APPDATA% /
 * %LOCALAPPDATA% (Windows las guarda aparte para cada app empaquetada). En el EXE (NSIS) no cambia nada.
 */
export function isWindowsStorePackage(
    proc: NodeJS.Process & { windowsStore?: boolean } = process
): boolean {
    return proc.windowsStore === true;
}

/** Directorio de trabajo para MPV / VLC: undefined = el de siempre (el de la app). */
export function externalPlayerWorkingDir(
    proc: NodeJS.Process & { windowsStore?: boolean } = process,
    homedir: () => string = os.homedir
): string | undefined {
    return isWindowsStorePackage(proc) ? homedir() : undefined;
}
