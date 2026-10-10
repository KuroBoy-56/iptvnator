import { hostOf, requiresValidCertificate } from './tls-policy';

describe('requiresValidCertificate', () => {
    it('always verifies the panel host and its subdomains', () => {
        expect(requiresValidCertificate('panel.example.com', 'panel.example.com')).toBe(true);
        expect(requiresValidCertificate('PANEL.example.com.', 'panel.example.com')).toBe(true);
        expect(requiresValidCertificate('cdn.panel.example.com', 'panel.example.com')).toBe(true);
    });

    it('verifies the public APIs', () => {
        expect(requiresValidCertificate('api.themoviedb.org', '')).toBe(true);
        expect(requiresValidCertificate('image.tmdb.org', '')).toBe(true);
        expect(requiresValidCertificate('cloudflare-dns.com', '')).toBe(true);
    });

    it('keeps accepting IPTV provider servers', () => {
        expect(requiresValidCertificate('line.provider.tv', 'panel.example.com')).toBe(false);
        expect(requiresValidCertificate('notpanel.example.com.evil', 'panel.example.com')).toBe(false);
        expect(requiresValidCertificate('evilthemoviedb.org', '')).toBe(false);
        expect(requiresValidCertificate('', 'panel.example.com')).toBe(false);
    });

    it('reads the host of a URL', () => {
        expect(hostOf('https://a.test:8443/x')).toBe('a.test');
        expect(hostOf('not a url')).toBe('');
    });
});
