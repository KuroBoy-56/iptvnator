import { inject, Injectable } from '@angular/core';
import { ParentalControlService } from '@iptvnator/services';
import { BehaviorSubject } from 'rxjs';

/** A session started from the panel stays usable offline for this long. */
const OFFLINE_SESSION_DAYS = 7;

/**
 * Session gate for the workspace. The session itself is opened by the login
 * screen after the panel confirms the device (see panel-login/); here we only
 * check that one exists and is recent enough.
 */
@Injectable({
    providedIn: 'root',
})
export class AuthService {
    public offlineWarning$ = new BehaviorSubject(false);
    private readonly parental = inject(ParentalControlService);

    async verifySessionActive(): Promise<boolean> {
        try {
            if (!localStorage.getItem('session_token')) return false;
            const started = Number(localStorage.getItem('session_date') ?? 0);
            const days = (Date.now() - started) / (1000 * 60 * 60 * 24);
            return started > 0 && days <= OFFLINE_SESSION_DAYS;
        } catch {
            return false;
        }
    }

    logout(): void {
        // el contenido para adultos desbloqueado con el PIN vuelve a quedar oculto
        this.parental.reset();
        try {
            localStorage.removeItem('session_token');
            localStorage.removeItem('session_date');
            localStorage.removeItem('session_user');
        } catch {
            // Storage unavailable.
        }
    }
}
