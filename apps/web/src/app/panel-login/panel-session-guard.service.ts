import { inject, Injectable } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../auth.service';
import { PanelAccount, PanelLoginService } from './panel-login.service';
import { PanelSessionService } from './panel-session.service';

/** How often the running app asks the panel whether this device still has its line. */
const RECHECK_MS = 10 * 60_000;

/**
 * Keeps an open session tied to the panel while the app runs: a demo ends at
 * its exact time and a line the panel no longer gives this device (deleted,
 * expired demo) closes the session and goes back to /login. A panel that does
 * not answer changes nothing.
 */
@Injectable({ providedIn: 'root' })
export class PanelSessionGuardService {
    private readonly panel = inject(PanelLoginService);
    private readonly session = inject(PanelSessionService);
    private readonly auth = inject(AuthService);
    private readonly router = inject(Router);
    private timer: ReturnType<typeof setInterval> | null = null;
    private lastCheck = 0;

    watch(account: PanelAccount): void {
        this.stop();
        this.lastCheck = Date.now();
        this.timer = setInterval(() => void this.tick(account), 30_000);
    }

    stop(): void {
        if (this.timer) clearInterval(this.timer);
        this.timer = null;
    }

    async tick(account: PanelAccount, now = Date.now()): Promise<void> {
        const demoOver = !!account.isDemo && (account.demoExpires ?? 0) > 0 && now / 1000 >= (account.demoExpires ?? 0);
        if (!demoOver) {
            if (now - this.lastCheck < RECHECK_MS) return;
            this.lastCheck = now;
            if ((await this.panel.checkDevice(true)).status !== 'inactive') return;
        }
        this.stop();
        await this.session.clear();
        this.auth.logout();
        await this.router.navigate(['/login']);
    }
}
