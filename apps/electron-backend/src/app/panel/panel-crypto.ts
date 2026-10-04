import { createCipheriv, createDecipheriv, createHmac, randomBytes } from 'crypto';

const SALT_LEN = 16;
const IV_LEN = 12;
const TAG_LEN = 16;

/** Same HKDF as the panel: prk = HMAC(salt, key); okm = HMAC(prk, 0x01)[0..32]. */
export function hkdf(masterKey: Buffer, salt: Buffer, length = 32): Buffer {
    const prk = createHmac('sha256', salt).update(masterKey).digest();
    return createHmac('sha256', prk).update(Buffer.from([1])).digest().subarray(0, length);
}

/** base64(salt16 + iv12 + AES-256-GCM ciphertext + tag16). */
export function encryptPayload(plain: string, masterKey: Buffer): string {
    const salt = randomBytes(SALT_LEN);
    const iv = randomBytes(IV_LEN);
    const cipher = createCipheriv('aes-256-gcm', hkdf(masterKey, salt), iv);
    const body = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
    return Buffer.concat([salt, iv, body, cipher.getAuthTag()]).toString('base64');
}

export function decryptPayload(encoded: string, masterKey: Buffer): string | null {
    try {
        const bin = Buffer.from(encoded.trim(), 'base64');
        if (bin.length < SALT_LEN + IV_LEN + TAG_LEN) return null;
        const salt = bin.subarray(0, SALT_LEN);
        const iv = bin.subarray(SALT_LEN, SALT_LEN + IV_LEN);
        const tag = bin.subarray(bin.length - TAG_LEN);
        const body = bin.subarray(SALT_LEN + IV_LEN, bin.length - TAG_LEN);
        const decipher = createDecipheriv('aes-256-gcm', hkdf(masterKey, salt), iv);
        decipher.setAuthTag(tag);
        return Buffer.concat([decipher.update(body), decipher.final()]).toString('utf8');
    } catch {
        return null;
    }
}
