/**
 * Control parental (como Roku, Vega, Android, iOS y las TV): las categorías para adultos se ocultan siempre y se
 * desbloquean con el PIN del equipo que guarda el panel (check_mac → "pin", 0000 de fábrica). El PIN se cambia en el
 * panel con login.php acción set_pin (pide el actual). Funciones puras: el estado vive en ParentalControlService.
 */

/** Mismas palabras que las demás apps. */
export const ADULT_CATEGORY_RE = /adult|xxx|\+18|18\+|porn|erot|playboy|hot ?club|venus/i;

export function isAdultName(name: string | null | undefined): boolean {
    return ADULT_CATEGORY_RE.test(String(name ?? ''));
}

export const DEFAULT_PARENTAL_PIN = '0000';
const PIN_KEY = 'parental_pin';
const HIDE_KEY = 'parental_hide_adult';

export function isParentalPin(value: unknown): value is string {
    return typeof value === 'string' && /^\d{4}$/.test(value);
}

export function readParentalPin(): string {
    try {
        const v = localStorage.getItem(PIN_KEY);
        return isParentalPin(v) ? v : DEFAULT_PARENTAL_PIN;
    } catch {
        return DEFAULT_PARENTAL_PIN;
    }
}

/** El PIN que dice el panel (check_mac / set_pin); otro valor no se guarda. */
export function saveParentalPin(pin: unknown): void {
    if (!isParentalPin(pin)) return;
    try {
        localStorage.setItem(PIN_KEY, pin);
    } catch {
        /* storage blocked */
    }
}

/** «Ocultar contenido para adultos»: encendido de fábrica. */
export function readHideAdult(): boolean {
    try {
        return localStorage.getItem(HIDE_KEY) !== '0';
    } catch {
        return true;
    }
}

export function saveHideAdult(hide: boolean): void {
    try {
        localStorage.setItem(HIDE_KEY, hide ? '1' : '0');
    } catch {
        /* storage blocked */
    }
}
