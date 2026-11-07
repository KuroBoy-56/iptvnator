import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { buildElectronBuilderMetadata } from '../generate-electron-builder-metadata.mjs';
import { readStoreIdentity, describeIdentityProblems } from './store-identity.mjs';
import { buildStoreConfig, checkStoreConfig, mergeReplacingArrays } from './store-config.mjs';
import { APPX_ASSETS, APPX_SOURCE_ICON, checkAppxAssets, generateAppxAssets } from './store-assets.mjs';
import { checkPlayerBinaries, comparePackagedPlayers } from './store-players.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const require = createRequire(import.meta.url);
const readJson = (file) => JSON.parse(fs.readFileSync(path.join(root, file), 'utf8'));

// valores con la forma de Partner Center, SOLO para las pruebas (no se usan para compilar)
const TEST_IDENTITY_ENV = {
    APPX_IDENTITY_NAME: '12345Prueba.MPXPlayer',
    APPX_PUBLISHER: 'CN=4F0D9F1C-1234-4E5A-9B3C-0123456789AB',
    APPX_PUBLISHER_DISPLAY_NAME: 'Editor de prueba',
    APPX_APPLICATION_ID: 'MPXPlayer',
};

function storeConfig(identityEnv = TEST_IDENTITY_ENV) {
    const baseConfig = readJson('electron-builder.json');
    const overlay = readJson('electron-builder.store.json');
    const { extraMetadata } = buildElectronBuilderMetadata(readJson('package.json'), baseConfig);
    return buildStoreConfig({ baseConfig, overlay, extraMetadata, identity: readStoreIdentity(identityEnv).identity });
}

test('identity: stops when the Partner Center values are missing and says where to put them', () => {
    const r = readStoreIdentity({});
    assert.equal(r.ok, false);
    assert.deepEqual(r.missing, ['APPX_IDENTITY_NAME', 'APPX_PUBLISHER', 'APPX_PUBLISHER_DISPLAY_NAME', 'APPX_APPLICATION_ID']);
    const text = describeIdentityProblems(r);
    assert.match(text, /\$env:APPX_PUBLISHER=/);
    assert.match(text, /Partner Center/);
});

test('identity: refuses the inherited IPTVnator id, placeholders, the Store Product ID and a publisher without CN=', () => {
    const bad = readStoreIdentity({
        APPX_IDENTITY_NAME: 'com.fourgray.iptvnator',
        APPX_PUBLISHER: 'Mi Empresa',
        APPX_PUBLISHER_DISPLAY_NAME: 'TODO',
        APPX_APPLICATION_ID: '9NBLGGH4R315',
    });
    assert.equal(bad.ok, false);
    assert.deepEqual(bad.invalid.map((p) => p.env).sort(), [
        'APPX_APPLICATION_ID',
        'APPX_IDENTITY_NAME',
        'APPX_PUBLISHER',
        'APPX_PUBLISHER_DISPLAY_NAME',
    ]);
    assert.equal(readStoreIdentity({ ...TEST_IDENTITY_ENV, APPX_PUBLISHER: 'CN=XXXXXXXX-XXXX' }).ok, false);
    assert.equal(readStoreIdentity(TEST_IDENTITY_ENV).ok, true);
});

test('store config: only AppX x64, no NSIS, bin/ (MPV + VLC) copied, no updater, version from package.json', () => {
    const config = storeConfig();
    assert.deepEqual(checkStoreConfig(config), []);
    assert.deepEqual(config.win.target, [{ target: 'appx', arch: ['x64'] }]);
    assert.equal(config.nsis, undefined);
    assert.equal(config.publish, null);
    assert.equal(config.extends, null);
    assert.ok(config.extraResources.some((r) => r.from === 'bin' && r.to === 'bin' && r.filter.includes('**/*')));
    assert.ok(config.asarUnpack.includes('**/*.dll'));
    assert.equal(config.extraMetadata.version, readJson('package.json').version);
    assert.equal(config.appx.identityName, TEST_IDENTITY_ENV.APPX_IDENTITY_NAME);
    assert.equal(config.appx.publisher, TEST_IDENTITY_ENV.APPX_PUBLISHER);
    assert.equal(config.appx.applicationId, 'MPXPlayer');
    assert.equal(config.directories.output, 'dist/store');
    assert.doesNotMatch(JSON.stringify(config), /4gray\/iptvnator\/releases|api\.github\.com/);
});

test('store config does not touch the EXE (NSIS) build', () => {
    const before = fs.readFileSync(path.join(root, 'electron-builder.json'), 'utf8');
    storeConfig();
    assert.equal(fs.readFileSync(path.join(root, 'electron-builder.json'), 'utf8'), before);
    const exe = JSON.parse(before);
    assert.ok(exe.win.target.every((t) => t.target === 'nsis'));
    assert.equal(exe.directories.output, 'dist/executables');
    const pkg = readJson('package.json');
    assert.equal(pkg.scripts['make:app'], 'nx run electron-backend:make');
    assert.equal(pkg.scripts['make:store'], 'node tools/packaging/make-store.mjs');
    const project = readJson('apps/electron-backend/project.json');
    assert.equal(project.targets.make.options.outputPath, 'dist/executables');
    assert.equal(project.targets.make.options.makerOptionsPath, undefined);
    assert.equal(project.targets['make-store'].options.outputPath, 'dist/store');
    assert.equal(project.targets['make-store'].executor, project.targets.make.executor);
    assert.match(readJson('apps/electron-backend/src/app/options/maker.options.json').extends, /metadata\.generated/);
});

test('arrays are replaced, not concatenated (Electron Builder extends would build NSIS + AppX)', () => {
    const merged = mergeReplacingArrays({ win: { target: ['nsis'], icon: 'a' } }, { win: { target: ['appx'] } });
    assert.deepEqual(merged, { win: { target: ['appx'], icon: 'a' } });
});

test('Electron Builder 26 reads the resolved store config alone (not merged with electron-builder.json)', async () => {
    const ebRequire = createRequire(require.resolve('electron-builder/package.json'));
    const { getConfig, validateConfiguration } = ebRequire('app-builder-lib/out/util/config/config');
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mpx-store-'));
    const file = path.join(dir, 'resolved.json');
    fs.writeFileSync(file, JSON.stringify(storeConfig()));
    // lo que pasa nx-electron:make además de la configuración (como en el EXE)
    const fromExecutor = { files: ['!(**/*.+(js|css).map)'], directories: { output: path.join(root, 'dist', 'store') } };
    const config = await getConfig(root, file, fromExecutor);
    assert.deepEqual(config.win.target, [{ target: 'appx', arch: ['x64'] }]);
    assert.equal(config.nsis, undefined);
    assert.ok(config.extraResources.some((r) => r.from === 'bin' && r.to === 'bin'));
    assert.equal(config.directories.output, path.join(root, 'dist', 'store'));
    // el esquema de Electron Builder 26 acepta la configuración (appx.languages, minVersion, publish null…)
    await validateConfiguration(config, { isEnabled: false, add() {} });
});

test('AppX images: right sizes, transparent, original logo untouched', async () => {
    const sharp = require('sharp');
    const hash = () => crypto.createHash('sha256').update(fs.readFileSync(path.join(root, APPX_SOURCE_ICON))).digest('hex');
    const before = hash();
    const out = fs.mkdtempSync(path.join(os.tmpdir(), 'mpx-appx-'));
    const outDir = path.relative(root, out);
    await generateAppxAssets({ sharp, workspaceRoot: root, outDir });
    assert.deepEqual(await checkAppxAssets({ sharp, workspaceRoot: root, outDir }), []);
    assert.equal(fs.readdirSync(out).length, APPX_ASSETS.length);
    assert.equal(hash(), before);
});

test('committed AppX images in apps/electron-backend/store/appx are valid', async () => {
    assert.deepEqual(await checkAppxAssets({ sharp: require('sharp'), workspaceRoot: root }), []);
});

test('MPV / VLC: missing files stop the build; the package must carry bin/ complete', () => {
    const src = fs.mkdtempSync(path.join(os.tmpdir(), 'mpx-bin-'));
    assert.ok(checkPlayerBinaries(src).missing.includes('mpv/mpv.exe'));
    for (const f of ['mpv/mpv.exe', 'vlc/vlc.exe', 'vlc/libvlc.dll', 'vlc/libvlccore.dll', 'vlc/plugins/access/libhttp_plugin.dll', 'vlc/axvlc.dll', 'vlc/npvlc.dll', 'vlc/locale/es/vlc.mo']) {
        fs.mkdirSync(path.dirname(path.join(src, f)), { recursive: true });
        fs.writeFileSync(path.join(src, f), f);
    }
    assert.deepEqual(checkPlayerBinaries(src).missing, []);
    assert.deepEqual(checkPlayerBinaries(src).optionalMissing, []);
    const packaged = fs.mkdtempSync(path.join(os.tmpdir(), 'mpx-packaged-'));
    fs.cpSync(src, packaged, { recursive: true });
    assert.deepEqual(comparePackagedPlayers(src, packaged), []);
    fs.rmSync(path.join(packaged, 'vlc', 'libvlccore.dll'));
    assert.ok(comparePackagedPlayers(src, packaged).length > 0);
});
