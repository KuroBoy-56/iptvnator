// Paso de Nx «electron-backend:prepare-store» (lo llama `pnpm run make:store`, después de compilar Angular y el
// backend y de generar los metadatos): recursos gráficos AppX y configuración resuelta de Electron Builder para la
// Store en dist/store-config/. No modifica electron-builder.json ni nada de la compilación EXE.
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { buildElectronBuilderMetadata } from './generate-electron-builder-metadata.mjs';
import { describeIdentityProblems, readStoreIdentity } from './store/store-identity.mjs';
import { checkAppxAssets, generateAppxAssets } from './store/store-assets.mjs';
import {
    STORE_OVERLAY_PATH,
    buildStoreConfig,
    checkStoreConfig,
    readJson,
    writeResolvedStoreConfig,
} from './store/store-config.mjs';
import { checkPlayerBinaries, formatMb } from './store/store-players.mjs';

const workspaceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const require = createRequire(import.meta.url);

function fail(message) {
    console.error(message);
    process.exit(1);
}

async function main() {
    const identityCheck = readStoreIdentity(process.env);
    if (!identityCheck.ok) fail(describeIdentityProblems(identityCheck));

    const players = checkPlayerBinaries(path.join(workspaceRoot, 'bin'));
    if (players.missing.length) {
        fail(`MPX Player › Microsoft Store: faltan los reproductores integrados en bin/: ${players.missing.join(', ')}`);
    }
    console.log(`MPV y VLC: ${players.stats.count} archivos, ${formatMb(players.stats.bytes)} (bin/ completo dentro del paquete)`);
    if (players.optionalMissing.length) console.warn(`  aviso: no están ${players.optionalMissing.join(', ')}`);

    const sharp = require('sharp');
    const written = await generateAppxAssets({ sharp, workspaceRoot });
    const assetErrors = await checkAppxAssets({ sharp, workspaceRoot });
    if (assetErrors.length) fail(`Recursos AppX: ${assetErrors.join('; ')}`);
    console.log(`Recursos AppX: ${written.map((f) => path.basename(f)).join(', ')}`);

    const packageMetadata = readJson(path.join(workspaceRoot, 'package.json'));
    const baseConfig = readJson(path.join(workspaceRoot, 'electron-builder.json'));
    const overlay = readJson(path.join(workspaceRoot, STORE_OVERLAY_PATH));
    const { extraMetadata } = buildElectronBuilderMetadata(packageMetadata, baseConfig);
    const config = buildStoreConfig({ baseConfig, overlay, extraMetadata, identity: identityCheck.identity });
    const configErrors = checkStoreConfig(config);
    if (configErrors.length) fail(`Configuración AppX: ${configErrors.join('; ')}`);
    const file = writeResolvedStoreConfig(workspaceRoot, config);
    console.log(`Configuración de la Store (versión ${extraMetadata.version}): ${path.relative(workspaceRoot, file)}`);
}

main().catch((error) => fail(error?.stack || String(error)));
