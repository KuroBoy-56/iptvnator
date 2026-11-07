// `pnpm run make:store`: paquete AppX de MPX Player para Microsoft Store, aparte del EXE (`pnpm run make:app`).
//   1. comprueba Windows, la identidad de Partner Center y que MPV y VLC estén en bin/ (antes de compilar nada)
//   2. `nx run electron-backend:make-store`: compila Angular (producción) y el backend, genera los metadatos, prepara
//      los recursos AppX y la configuración (prepare-store.mjs) y ejecuta Electron Builder con el destino appx
//      (el mismo ejecutor nx-electron:make que el EXE) con salida en dist/store
//   3. verifica que el .appx exista y que resources/bin del paquete tenga MPV y VLC completos
// Sin certificado: el paquete para la Store va sin firmar (Microsoft lo firma al publicarlo). Si hay un certificado en
// CSC_LINK / WIN_CSC_LINK (el del EXE), no se usa para este paquete.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { describeIdentityProblems, readStoreIdentity } from './store/store-identity.mjs';
import { STORE_OUTPUT_DIR } from './store/store-config.mjs';
import { checkPlayerBinaries, comparePackagedPlayers, formatMb } from './store/store-players.mjs';

const workspaceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const require = createRequire(import.meta.url);
const SIGNING_VARS = ['CSC_LINK', 'CSC_KEY_PASSWORD', 'WIN_CSC_LINK', 'WIN_CSC_KEY_PASSWORD', 'CSC_NAME'];

function fail(message) {
    console.error(message);
    process.exit(1);
}

function preflight() {
    if (process.platform !== 'win32') {
        fail('El paquete AppX de Microsoft Store solo se genera en Windows 10 u 11 (Electron Builder usa makeappx.exe).');
    }
    const identity = readStoreIdentity(process.env);
    if (!identity.ok) fail(describeIdentityProblems(identity));
    const players = checkPlayerBinaries(path.join(workspaceRoot, 'bin'));
    if (players.missing.length) {
        fail(`Faltan MPV / VLC en bin/: ${players.missing.join(', ')}. Copia las carpetas bin/mpv y bin/vlc como para el EXE.`);
    }
    console.log(`Identidad: ${identity.identity.identityName} · ${identity.identity.publisher}`);
    console.log(`MPV y VLC en bin/: ${players.stats.count} archivos, ${formatMb(players.stats.bytes)}`);
}

function runNx() {
    const nxDir = path.dirname(require.resolve('nx/package.json'));
    const nxBin = path.join(nxDir, require('nx/package.json').bin.nx);
    const env = { ...process.env };
    const dropped = SIGNING_VARS.filter((name) => env[name]);
    for (const name of dropped) delete env[name];
    if (dropped.length) console.log(`Sin firmar para la Store: no se usa ${dropped.join(', ')} en este paquete.`);
    const result = spawnSync(process.execPath, [nxBin, 'run', 'electron-backend:make-store'], {
        cwd: workspaceRoot,
        env,
        stdio: 'inherit',
    });
    if (result.status !== 0) fail(`nx run electron-backend:make-store terminó con código ${result.status ?? result.signal}`);
}

function verify() {
    const outDir = path.join(workspaceRoot, STORE_OUTPUT_DIR);
    const appx = fs.existsSync(outDir) ? fs.readdirSync(outDir).filter((f) => /\.appx$/i.test(f)) : [];
    if (!appx.length) fail(`No se generó ningún .appx en ${STORE_OUTPUT_DIR}.`);
    const errors = comparePackagedPlayers(
        path.join(workspaceRoot, 'bin'),
        path.join(outDir, 'win-unpacked', 'resources', 'bin')
    );
    if (errors.length) fail(`MPV / VLC incompletos en el paquete: ${errors.join('; ')}`);
    for (const file of appx) {
        console.log(`Listo: ${path.join(STORE_OUTPUT_DIR, file)} (${formatMb(fs.statSync(path.join(outDir, file)).size)})`);
    }
    console.log('MPV y VLC incluidos completos en resources/bin. El paquete va sin firmar: súbelo a Partner Center.');
}

preflight();
runNx();
verify();
