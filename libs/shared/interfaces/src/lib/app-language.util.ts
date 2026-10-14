/**
 * App language of MPX Player: Spanish (default and fallback), English,
 * Portuguese (Brazil) and French. "auto" follows the system language.
 */
export const APP_LANGUAGES = ['es', 'en', 'pt', 'fr'] as const;
export type AppLanguage = (typeof APP_LANGUAGES)[number];
export const APP_LANGUAGE_AUTO = 'auto';
export type AppLanguageSetting = AppLanguage | typeof APP_LANGUAGE_AUTO;
export const DEFAULT_APP_LANGUAGE: AppLanguage = 'es';

/** Choices of "Idioma de la app" (labels in their own language). */
export const APP_LANGUAGE_OPTIONS: readonly { value: AppLanguageSetting; label: string }[] = [
    { value: APP_LANGUAGE_AUTO, label: 'MPX.LANGUAGE.AUTO' },
    { value: 'es', label: 'Español' },
    { value: 'en', label: 'English' },
    { value: 'pt', label: 'Português' },
    { value: 'fr', label: 'Français' },
];

/** Resolved language of the last start, read synchronously for the first render and panel requests. */
export const APP_LANGUAGE_STORAGE_KEY = 'iptvnator:preferred-language';

/** TMDB code per app language (details); title search and matching stay in es-MX. */
const TMDB_CODES: Record<AppLanguage, string> = { es: 'es-MX', en: 'en-US', pt: 'pt-BR', fr: 'fr-FR' };
export const TMDB_MATCH_LANGUAGE = 'es-MX';

export function isAppLanguage(value: unknown): value is AppLanguage {
    return typeof value === 'string' && (APP_LANGUAGES as readonly string[]).includes(value);
}

function systemLocale(): string {
    try {
        return (typeof navigator !== 'undefined' && navigator.language) || '';
    } catch {
        return '';
    }
}

/**
 * A chosen language wins; "auto" (or anything else, e.g. an old setting in a
 * language the app no longer offers) uses the first two letters of the system
 * language when it is es/en/pt/fr, else Spanish.
 */
export function resolveAppLanguage(setting?: string | null, locale = systemLocale()): AppLanguage {
    if (isAppLanguage(setting)) return setting;
    const system = (locale || '').slice(0, 2).toLowerCase();
    return isAppLanguage(system) ? system : DEFAULT_APP_LANGUAGE;
}

/** Language in use (saved by the app on every change); the system one before the first start. */
export function currentAppLanguage(): AppLanguage {
    try {
        const saved = localStorage.getItem(APP_LANGUAGE_STORAGE_KEY);
        if (isAppLanguage(saved)) return saved;
    } catch {
        // storage blocked: fall back to the system language
    }
    return resolveAppLanguage(APP_LANGUAGE_AUTO);
}

export function rememberAppLanguage(lang: AppLanguage): void {
    try {
        localStorage.setItem(APP_LANGUAGE_STORAGE_KEY, lang);
    } catch {
        // storage blocked: the next start detects it again
    }
}

/** Appends lang=<es|en|pt|fr> so the panel answers its own texts in the app language. */
export function withPanelLang(url: string, lang: AppLanguage = currentAppLanguage()): string {
    return `${url}${url.includes('?') ? '&' : '?'}lang=${lang}`;
}

export function tmdbLanguageFor(lang: AppLanguage = currentAppLanguage()): string {
    return TMDB_CODES[lang] ?? TMDB_MATCH_LANGUAGE;
}

/**
 * The old default setting was English, so a saved "en" from before the
 * language picker existed means "never chosen": it becomes "auto" once
 * (the store sets APP_LANGUAGE_MIGRATED_KEY after saving). Languages the app
 * no longer offers also become "auto".
 */
export const APP_LANGUAGE_MIGRATED_KEY = 'mpx:language-auto-v1';
export function migrateLegacyLanguage(stored: string | null | undefined, migrated: boolean): AppLanguageSetting {
    if (!migrated && stored === 'en') return APP_LANGUAGE_AUTO;
    return isAppLanguage(stored) ? stored : APP_LANGUAGE_AUTO;
}

/**
 * Text for the UI, shown through the translate pipe: a translation key with
 * params, or a panel text as is (a text that is no key comes back unchanged).
 */
export interface UiText {
    key: string;
    params?: Record<string, string | number>;
}
