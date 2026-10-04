import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * The AES master key shared with the panel is never committed. It comes from
 * PANEL_MASTER_KEY (development) or from assets/panel-key.json, which
 * tools/panel/write-panel-key.mjs generates at build time (git-ignored).
 */
export const PANEL_KEY_FILE = 'panel-key.json';

function fromHex(value: unknown): Buffer | null {
    const hex = typeof value === 'string' ? value.trim() : '';
    return /^[0-9a-fA-F]{64}$/.test(hex) ? Buffer.from(hex, 'hex') : null;
}

export function loadPanelMasterKey(
    env: NodeJS.ProcessEnv = process.env,
    baseDir: string = __dirname
): Buffer | null {
    const fromEnv = fromHex(env['PANEL_MASTER_KEY']);
    if (fromEnv) return fromEnv;
    for (const dir of [join(baseDir, 'assets'), baseDir]) {
        try {
            const json = JSON.parse(readFileSync(join(dir, PANEL_KEY_FILE), 'utf8'));
            const key = fromHex(json?.masterKeyHex);
            if (key) return key;
        } catch {
            // Not generated for this build.
        }
    }
    return null;
}
