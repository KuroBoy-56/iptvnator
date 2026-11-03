import { computed, Injectable, signal } from '@angular/core';
import { isAdultName, readHideAdult, readParentalPin, saveHideAdult, saveParentalPin } from '@iptvnator/shared/interfaces';

/**
 * Estado del control parental de la app abierta: «Ocultar contenido para adultos» (encendido de fábrica) y el
 * desbloqueo con el PIN del panel, que dura hasta cerrar la app (como las demás apps). Mientras está bloqueado, las
 * categorías para adultos no aparecen en Inicio, Películas, Series, Explorar ni TV en vivo.
 */
@Injectable({ providedIn: 'root' })
export class ParentalControlService {
    private readonly hide = signal(readHideAdult());
    private readonly unlockedNow = signal(false);

    /** «Ocultar contenido para adultos» encendido */
    readonly hideAdult = this.hide.asReadonly();
    /** desbloqueado con el PIN en esta sesión */
    readonly unlocked = this.unlockedNow.asReadonly();
    /** las categorías para adultos se ocultan */
    readonly locked = computed(() => this.hide() && !this.unlockedNow());

    /** ¿esta categoría se oculta ahora? */
    hides(categoryName: string | null | undefined): boolean {
        return this.locked() && isAdultName(categoryName);
    }

    /** las categorías visibles (sin las de adultos mientras esté bloqueado) */
    visible<T>(categories: readonly T[], nameOf: (c: T) => string): T[] {
        if (!this.locked()) return [...categories];
        return categories.filter((c) => !isAdultName(nameOf(c)));
    }

    /** ids de las categorías ocultas de una lista */
    hiddenIds<T>(categories: readonly T[], nameOf: (c: T) => string, idOf: (c: T) => string): Set<string> {
        const out = new Set<string>();
        if (!this.locked()) return out;
        for (const c of categories) if (isAdultName(nameOf(c))) out.add(idOf(c));
        return out;
    }

    /** true = PIN correcto: las categorías para adultos se ven hasta cerrar la app */
    unlock(pin: string): boolean {
        if (pin.trim() !== readParentalPin()) return false;
        this.unlockedNow.set(true);
        return true;
    }

    lock(): void {
        this.unlockedNow.set(false);
    }

    /** apagar «Ocultar…» pide el PIN; encenderlo no */
    setHideAdult(hide: boolean, pin = ''): boolean {
        if (!hide && pin.trim() !== readParentalPin()) return false;
        saveHideAdult(hide);
        this.hide.set(hide);
        if (hide) this.unlockedNow.set(false);
        return true;
    }

    /** el PIN que guardó el panel (check_mac / set_pin) */
    rememberPin(pin: unknown): void {
        saveParentalPin(pin);
    }

    /** cerrar sesión: se vuelve a bloquear */
    reset(): void {
        this.unlockedNow.set(false);
    }
}
