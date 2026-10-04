import { decodePanelUrl, deriveApiBase, getPanelApiBase, panelEndpoint } from './panel-endpoint.util';

function encode(url: string, key: string): string {
    let xored = '';
    for (let i = 0; i < url.length; i++) {
        xored += String.fromCharCode(url.charCodeAt(i) ^ key.charCodeAt(i % key.length));
    }
    return Array.from(btoa(xored))
        .map((c) => c.charCodeAt(0).toString(16).padStart(2, '0'))
        .join('');
}

describe('panel endpoint', () => {
    it('reverses hex -> base64 -> XOR encoding', () => {
        const hex = encode('https://example.test/a/api/player_api.php', 'KURO');
        expect(decodePanelUrl(hex)).toBe('https://example.test/a/api/player_api.php');
    });

    it('derives the api base from the decoded file url', () => {
        expect(deriveApiBase('https://example.test/a/api/player_api.php')).toBe(
            'https://example.test/a/api/'
        );
    });

    it('builds endpoints under the embedded panel api base', () => {
        expect(getPanelApiBase()).toMatch(/^https:\/\/.+\/api\/$/);
        expect(panelEndpoint('progress.php')).toBe(`${getPanelApiBase()}progress.php`);
    });
});
