import { normalizeDeviceId, parseIoPlatformUuid, parseMachineGuid } from './device-id';

describe('device id', () => {
    it('hashes the raw id into 8 uppercase hex pairs', () => {
        expect(normalizeDeviceId('machine-guid-1')).toBe('92:7A:EE:81:35:75:D7:16');
    });

    it('skips a window starting with 00 so the panel keeps it unchanged', () => {
        // sha256("id-487") starts with "00555A6E9825DB454C…"
        expect(normalizeDeviceId('id-487')).toBe('55:5A:6E:98:25:DB:45:4C');
    });

    it('matches the auto-demo id format', () => {
        expect(normalizeDeviceId('anything')).toMatch(/^([0-9A-F]{2}:){7}[0-9A-F]{2}$/);
    });

    it('parses the Windows MachineGuid registry output', () => {
        const output = '\r\nHKEY_LOCAL_MACHINE\\SOFTWARE\\Microsoft\\Cryptography\r\n    MachineGuid    REG_SZ    1b2c3d4e-0000-1111-2222-333344445555\r\n';
        expect(parseMachineGuid(output)).toBe('1b2c3d4e-0000-1111-2222-333344445555');
    });

    it('parses the macOS IOPlatformUUID', () => {
        expect(parseIoPlatformUuid('  "IOPlatformUUID" = "ABCD-1234"\n')).toBe('ABCD-1234');
    });
});
