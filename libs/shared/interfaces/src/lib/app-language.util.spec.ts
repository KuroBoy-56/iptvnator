import {
    APP_LANGUAGE_STORAGE_KEY,
    currentAppLanguage,
    migrateLegacyLanguage,
    resolveAppLanguage,
    tmdbLanguageFor,
    withPanelLang,
} from './app-language.util';

// the project runs these specs in node: a small in-memory localStorage
const mem = new Map<string, string>();
Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
        getItem: (k: string) => (mem.has(k) ? (mem.get(k) as string) : null),
        setItem: (k: string, v: string) => void mem.set(k, String(v)),
        removeItem: (k: string) => void mem.delete(k),
        clear: () => mem.clear(),
    },
});

describe('app language', () => {
    afterEach(() => mem.clear());

    it('uses a chosen language as is', () => {
        expect(resolveAppLanguage('fr', 'en-US')).toBe('fr');
        expect(resolveAppLanguage('pt', 'es-MX')).toBe('pt');
    });

    it('follows the first two letters of the system language on "auto"', () => {
        expect(resolveAppLanguage('auto', 'pt-BR')).toBe('pt');
        expect(resolveAppLanguage('auto', 'en-GB')).toBe('en');
        expect(resolveAppLanguage(undefined, 'FR-ca')).toBe('fr');
    });

    it('falls back to Spanish for other system languages and old settings', () => {
        expect(resolveAppLanguage('auto', 'de-DE')).toBe('es');
        expect(resolveAppLanguage('auto', '')).toBe('es');
        expect(resolveAppLanguage('de', 'it-IT')).toBe('es');
    });

    it('reads the saved language, else the system one', () => {
        localStorage.setItem(APP_LANGUAGE_STORAGE_KEY, 'pt');
        expect(currentAppLanguage()).toBe('pt');
        localStorage.setItem(APP_LANGUAGE_STORAGE_KEY, 'xx');
        expect(['es', 'en', 'pt', 'fr']).toContain(currentAppLanguage());
    });

    it('adds lang to panel URLs', () => {
        expect(withPanelLang('https://p/api/sports.php', 'en')).toBe('https://p/api/sports.php?lang=en');
        expect(withPanelLang('https://p/api/progress.php?v=2', 'fr')).toBe('https://p/api/progress.php?v=2&lang=fr');
    });

    it('maps app languages to TMDB codes', () => {
        expect(tmdbLanguageFor('es')).toBe('es-MX');
        expect(tmdbLanguageFor('en')).toBe('en-US');
        expect(tmdbLanguageFor('pt')).toBe('pt-BR');
        expect(tmdbLanguageFor('fr')).toBe('fr-FR');
    });

    it('turns the old English default into "auto" once', () => {
        expect(migrateLegacyLanguage('en', false)).toBe('auto');
        expect(migrateLegacyLanguage('en', true)).toBe('en');
        expect(migrateLegacyLanguage('es', false)).toBe('es');
        expect(migrateLegacyLanguage('de', true)).toBe('auto');
        expect(migrateLegacyLanguage(undefined, false)).toBe('auto');
    });
});
