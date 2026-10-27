import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { AuthService } from '../auth.service';
import { PanelLoginService } from './panel-login.service';
import { PanelSessionGuardService } from './panel-session-guard.service';
import { PanelSessionService } from './panel-session.service';

describe('PanelSessionGuardService', () => {
    const checkDevice = jest.fn();
    const clear = jest.fn().mockResolvedValue(undefined);
    const logout = jest.fn();
    const navigate = jest.fn().mockResolvedValue(true);
    let guard: PanelSessionGuardService;
    const line = { server: 'http://s', username: 'u', password: 'p', isDemo: false };

    beforeEach(() => {
        jest.clearAllMocks();
        TestBed.configureTestingModule({
            providers: [
                { provide: PanelLoginService, useValue: { checkDevice } },
                { provide: PanelSessionService, useValue: { clear } },
                { provide: AuthService, useValue: { logout } },
                { provide: Router, useValue: { navigate } },
            ],
        });
        guard = TestBed.inject(PanelSessionGuardService);
    });

    afterEach(() => guard.stop());

    it('closes a demo at its exact end without asking the panel', async () => {
        guard.watch({ ...line, isDemo: true, demoExpires: 1000 });
        await guard.tick({ ...line, isDemo: true, demoExpires: 1000 }, 1_000_000);
        expect(checkDevice).not.toHaveBeenCalled();
        expect(clear).toHaveBeenCalled();
        expect(navigate).toHaveBeenCalledWith(['/login']);
    });

    it('closes the session when the panel no longer gives this device a line', async () => {
        guard.watch(line);
        checkDevice.mockResolvedValue({ status: 'inactive' });
        await guard.tick(line, Date.now() + 11 * 60_000);
        // the open app's re-check goes as poll (the panel does not count it as another start)
        expect(checkDevice).toHaveBeenCalledWith(true);
        expect(logout).toHaveBeenCalled();
    });

    it('keeps the session while the panel does not answer or before the next check', async () => {
        guard.watch(line);
        await guard.tick(line, Date.now() + 60_000);
        expect(checkDevice).not.toHaveBeenCalled();
        checkDevice.mockResolvedValue({ status: 'error', message: 'x' });
        await guard.tick(line, Date.now() + 11 * 60_000);
        expect(clear).not.toHaveBeenCalled();
    });
});
