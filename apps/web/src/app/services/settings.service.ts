import { inject, Injectable } from '@angular/core';
import { StorageMap } from '@ngx-pwa/local-storage';
import { Observable } from 'rxjs';
import { STORE_KEY, Theme } from '@iptvnator/shared/interfaces';

@Injectable({
    providedIn: 'root',
})
export class SettingsService {
    private storage = inject(StorageMap);

    /**
     * MPX Player has a single look: the dark Netflix palette of the web
     * player. The workspace shell paints #141414 with off-white text, so a
     * light Material theme (an old saved "Light" setting, or "System" on a
     * light Windows desktop) produced white surfaces with white text in live
     * TV, settings and detail pages. Any saved value now resolves to dark.
     */
    changeTheme(_selectedTheme?: Theme): void {
        document.body.classList.add('dark-theme');
    }

    /**
     * Returns the value of the given key from the local storage
     * @param key key to get
     * @returns returns the value of the given key
     */
    getValueFromLocalStorage<T = unknown>(key: STORE_KEY): Observable<T> {
        return this.storage.get(key) as Observable<T>;
    }

    /**
     * Sets the given key/value pair in the local storage
     * @param key key to set
     * @param value value to set
     * @param withCallback if true, the callback will be called after the value is set
     */
    setValueToLocalStorage(
        key: STORE_KEY,
        value: unknown,
        withCallback = false
    ): Observable<unknown> | void {
        if (withCallback) {
            return this.storage.set(key, value);
        }

        this.storage.set(key, value).subscribe();
    }
}
