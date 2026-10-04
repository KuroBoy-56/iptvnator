import { decryptPayload, encryptPayload, hkdf } from './panel-crypto';

const key = Buffer.from('00'.repeat(31) + '01', 'hex');

describe('panel crypto', () => {
    it('derives the key like the panel hkdf()', () => {
        const salt = Buffer.from(Array.from({ length: 16 }, (_, i) => i));
        expect(hkdf(key, salt).toString('hex')).toBe(
            'e50ed2dcb6e19a04aff61358b73a7556b271ddcea33b30eb7a416b3ea5d9e960'
        );
    });

    it('produces salt16 + iv12 + cipher + tag16 and round-trips', () => {
        const encoded = encryptPayload('{"mac_address":"AA:BB"}', key);
        const bin = Buffer.from(encoded, 'base64');
        expect(bin.length).toBe(16 + 12 + 23 + 16);
        expect(decryptPayload(encoded, key)).toBe('{"mac_address":"AA:BB"}');
    });

    it('rejects tampered or foreign payloads', () => {
        const encoded = encryptPayload('hello', key);
        const other = Buffer.from('11'.repeat(32), 'hex');
        expect(decryptPayload(encoded, other)).toBeNull();
        expect(decryptPayload('short', key)).toBeNull();
    });
});
