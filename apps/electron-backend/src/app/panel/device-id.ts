import { execFile } from 'child_process';
import { createHash } from 'crypto';
import { readFile } from 'fs/promises';
import { hostname, networkInterfaces } from 'os';

function run(command: string, args: string[]): Promise<string> {
    return new Promise((resolve) => {
        execFile(command, args, { timeout: 5000, windowsHide: true }, (error, stdout) =>
            resolve(error ? '' : String(stdout))
        );
    });
}

/** Parses `reg query ... /v MachineGuid` output. */
export function parseMachineGuid(output: string): string {
    const match = /MachineGuid\s+REG_\w+\s+([^\s]+)/i.exec(output);
    return match ? match[1].trim() : '';
}

/** Parses `ioreg -rd1 -c IOPlatformExpertDevice` output. */
export function parseIoPlatformUuid(output: string): string {
    const match = /"IOPlatformUUID"\s*=\s*"([^"]+)"/.exec(output);
    return match ? match[1].trim() : '';
}

async function readFirstFile(paths: string[]): Promise<string> {
    for (const path of paths) {
        try {
            const value = (await readFile(path, 'utf8')).trim();
            if (value) return value;
        } catch {
            // Try the next candidate.
        }
    }
    return '';
}

function fallbackId(): string {
    const macs = Object.values(networkInterfaces())
        .flat()
        .filter((net) => net && !net.internal && net.mac && net.mac !== '00:00:00:00:00:00')
        .map((net) => net?.mac)
        .sort();
    return `${hostname()}|${macs[0] ?? ''}`;
}

/** Stable raw machine id: Windows MachineGuid, Linux machine-id, macOS IOPlatformUUID. */
export async function readRawMachineId(platform = process.platform): Promise<string> {
    let raw = '';
    if (platform === 'win32') {
        raw = parseMachineGuid(
            await run('reg', ['query', 'HKLM\\SOFTWARE\\Microsoft\\Cryptography', '/v', 'MachineGuid'])
        );
    } else if (platform === 'darwin') {
        raw = parseIoPlatformUuid(await run('ioreg', ['-rd1', '-c', 'IOPlatformExpertDevice']));
    } else {
        raw = await readFirstFile(['/etc/machine-id', '/var/lib/dbus/machine-id']);
    }
    return raw || fallbackId();
}

/**
 * SHA-256 of the raw id, shown as 8 hex pairs ("A1:B2:…"). The panel's
 * normalise_mac strips a leading "00:", so the first 16-hex window that does
 * not start with "00" is used and the id stays identical on the panel.
 */
export function normalizeDeviceId(raw: string): string {
    const hex = createHash('sha256').update(raw).digest('hex').toUpperCase();
    let window = hex.slice(0, 16);
    for (let offset = 0; offset + 16 <= hex.length; offset += 2) {
        const candidate = hex.slice(offset, offset + 16);
        if (!candidate.startsWith('00')) {
            window = candidate;
            break;
        }
    }
    return window.match(/.{2}/g)?.join(':') ?? window;
}

let cached: Promise<string> | null = null;

export function getDeviceId(): Promise<string> {
    cached ??= readRawMachineId().then(normalizeDeviceId);
    return cached;
}
