/**
 * Writes the panel AES master key from the PANEL_MASTER_KEY environment
 * variable into apps/electron-backend/src/assets/panel-key.json before an
 * Electron build. The file is git-ignored and copied into the build output,
 * where apps/electron-backend/src/app/panel/panel-master-key.ts reads it.
 *
 * Without PANEL_MASTER_KEY the script is a no-op: the app still builds, and
 * the login screen reports that the panel key is missing.
 *
 * Usage (CI, before `nx build electron-backend`):
 *   PANEL_MASTER_KEY=<64 hex chars> node tools/panel/write-panel-key.mjs
 */
import { writeFileSync } from 'node:fs';

const TARGET = 'apps/electron-backend/src/assets/panel-key.json';
const key = (process.env.PANEL_MASTER_KEY ?? '').trim();

if (!key) {
    console.warn('PANEL_MASTER_KEY is not set — panel login will be unavailable in this build.');
    process.exit(0);
}

if (!/^[0-9a-fA-F]{64}$/.test(key)) {
    console.error('PANEL_MASTER_KEY must be 64 hexadecimal characters; aborting.');
    process.exit(1);
}

writeFileSync(TARGET, JSON.stringify({ masterKeyHex: key.toLowerCase() }) + '\n', { mode: 0o600 });
console.log(`Wrote panel key to ${TARGET} (git-ignored).`);
