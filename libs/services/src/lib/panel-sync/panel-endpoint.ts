/**
 * Panel endpoint resolution.
 *
 * The panel URL is not stored in plain text: it is XOR-ed with a short key,
 * base64-encoded and then hex-encoded. It is decoded at runtime and the API
 * base (".../api/") is derived from it.
 */
const PANEL_URL_HEX =
    '4979456d507a6876665741734e4341715053773850796f374e794d34657a3475507a67694e32553250534a6b4f444d38507a41675944733050436f6e656a4d2f496e6f6949796f734e7a30554e43496d5a53553650773d3d';
const PANEL_URL_KEY = 'KURO';

function hexToText(hex: string): string {
    let out = '';
    for (let i = 0; i + 1 < hex.length; i += 2) {
        out += String.fromCharCode(parseInt(hex.slice(i, i + 2), 16));
    }
    return out;
}

/** Reverses hex -> base64 -> XOR(key). */
export function decodePanelUrl(hex: string, key = PANEL_URL_KEY): string {
    const xored = atob(hexToText(hex));
    let out = '';
    for (let i = 0; i < xored.length; i++) {
        out += String.fromCharCode(
            xored.charCodeAt(i) ^ key.charCodeAt(i % key.length)
        );
    }
    return out;
}

/** Strips the file name, e.g. ".../api/player_api.php" -> ".../api/". */
export function deriveApiBase(url: string): string {
    const index = url.lastIndexOf('/');
    return index >= 0 ? url.slice(0, index + 1) : `${url}/`;
}

let cachedApiBase: string | null = null;

export function getPanelApiBase(): string {
    if (cachedApiBase === null) {
        cachedApiBase = deriveApiBase(decodePanelUrl(PANEL_URL_HEX));
    }
    return cachedApiBase;
}

/** Full URL of a panel API file, e.g. panelEndpoint('progress.php'). */
export function panelEndpoint(file: string): string {
    return `${getPanelApiBase()}${file}`;
}
