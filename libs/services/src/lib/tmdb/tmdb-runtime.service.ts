import { Injectable, inject } from '@angular/core';
import { resolveAppLanguage, TMDB_MATCH_LANGUAGE, tmdbLanguageFor } from '@iptvnator/shared/interfaces';
import { SettingsStore } from '../settings-store.service';
import { readPanelTmdbKey } from '../panel-sync/panel-tmdb-key';
import { DEFAULT_TMDB_API_KEY } from './tmdb-config';

/**
 * Shared TMDB runtime context: opt-in gate, effective API key and language
 * resolution. Injected by every TMDB service so the rules live in exactly
 * one place.
 */
@Injectable({ providedIn: 'root' })
export class TmdbRuntimeService {
    private readonly settingsStore = inject(SettingsStore);

    /** On when enabled in settings, and always when the panel provides a key. */
    isEnabled(): boolean {
        if (readPanelTmdbKey()) return true;
        return Boolean(this.settingsStore.tmdb?.()?.enabled && this.apiKey());
    }

    /** User-provided key from settings, else the panel's key, else the embedded default */
    apiKey(): string {
        return (
            this.settingsStore.tmdb?.()?.apiKey?.trim() ||
            readPanelTmdbKey() ||
            DEFAULT_TMDB_API_KEY
        );
    }

    /** TMDB language of detail calls, from the app language: es-MX, en-US, pt-BR or fr-FR */
    language(): string {
        return tmdbLanguageFor(this.appLanguage());
    }

    /**
     * Title search and catalog matching stay in es-MX whatever the app
     * language: the providers' titles are Spanish.
     */
    searchLanguage(): string {
        return TMDB_MATCH_LANGUAGE;
    }

    /** App language in use ("es", "en", "pt" or "fr"; "auto" resolved) */
    appLanguage() {
        return resolveAppLanguage(this.settingsStore.language());
    }
}
