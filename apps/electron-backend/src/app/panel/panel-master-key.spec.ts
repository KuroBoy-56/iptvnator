import { mkdtempSync, mkdirSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { loadPanelMasterKey } from './panel-master-key';

describe('loadPanelMasterKey', () => {
    const hex = 'ab'.repeat(32);

    it('prefers PANEL_MASTER_KEY from the environment', () => {
        expect(loadPanelMasterKey({ PANEL_MASTER_KEY: hex }, '/nowhere')?.toString('hex')).toBe(hex);
    });

    it('reads the generated assets/panel-key.json', () => {
        const dir = mkdtempSync(join(tmpdir(), 'panel-key-'));
        mkdirSync(join(dir, 'assets'));
        writeFileSync(join(dir, 'assets', 'panel-key.json'), JSON.stringify({ masterKeyHex: hex }));
        expect(loadPanelMasterKey({}, dir)?.toString('hex')).toBe(hex);
    });

    it('returns null when the key is missing or malformed', () => {
        expect(loadPanelMasterKey({ PANEL_MASTER_KEY: 'xyz' }, '/nowhere')).toBeNull();
    });
});
