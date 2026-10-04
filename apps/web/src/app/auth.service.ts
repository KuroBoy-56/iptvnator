import { Injectable } from '@angular/core';
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
        try {
            localStorage.removeItem('session_token');
            localStorage.removeItem('session_date');
            localStorage.removeItem('session_user');
        } catch {
            // Storage unavailable.
        }
    }
}
