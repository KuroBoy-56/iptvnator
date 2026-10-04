import { ChangeDetectionStrategy, Component, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { LoginPostersService } from './panel-login/login-posters.service';
import { PanelLoginService } from './panel-login/panel-login.service';
import { PanelSessionService } from './panel-login/panel-session.service';
import { SecureDnsPickerComponent } from './panel-login/secure-dns-picker.component';

type MessageKind = 'error' | 'info' | 'success';

/**
 * Login / device activation through the panel (same flow as the Android
 * app): the device id is checked first (check_mac); a new device activates
 * with its line (submit_url) or gets a one-time demo (auto_demo).
 */
@Component({
    standalone: true,
    selector: 'app-login',
    templateUrl: './login.component.html',
    styleUrls: ['./login.component.scss'],
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [FormsModule, SecureDnsPickerComponent],
})
export class LoginComponent implements OnInit {
    private readonly panel = inject(PanelLoginService);
    private readonly session = inject(PanelSessionService);
    private readonly posterService = inject(LoginPostersService);
    private readonly router = inject(Router);

    readonly posters = signal<string[]>(this.posterService.cached());
    readonly deviceId = signal('');
    readonly checking = signal(true);
    readonly busy = signal(false);
    readonly demoBusy = signal(false);
    readonly demoBlocked = signal(false);
    readonly showPassword = signal(false);
    readonly message = signal<{ text: string; kind: MessageKind } | null>(null);
    readonly dnsList = signal<string[]>([]);

    username = '';
    password = '';
    selectedDns = '';

    async ngOnInit(): Promise<void> {
        void this.posterService.load().then((list) => list.length && this.posters.set(list));

        if (!this.panel.available) {
            this.checking.set(false);
            this.say('El inicio de sesión del panel solo está disponible en la app de escritorio.', 'error');
            return;
        }

        this.deviceId.set(await this.panel.deviceId());
        const check = await this.panel.checkDevice();
        if (check.status === 'active') {
            this.say('Dispositivo activado. Entrando…', 'success');
            await this.enter(check.account);
            return;
        }
        if (check.status === 'error') {
            this.say(check.message, 'error');
        } else {
            await this.session.clear();
        }
        this.checking.set(false);
        await this.loadDns();
    }

    private async loadDns(): Promise<void> {
        const list = await this.panel.fetchDns();
        this.dnsList.set(list);
        if (!this.selectedDns && list.length) this.selectedDns = list[0];
    }

    async login(): Promise<void> {
        const user = this.username.trim();
        const pass = this.password.trim();
        if (!user || !pass) {
            this.say('Escribe tu usuario y contraseña.', 'error');
            return;
        }
        if (!this.selectedDns) await this.loadDns();
        if (!this.selectedDns) {
            this.say('El panel no tiene servidores disponibles.', 'error');
            return;
        }
        this.busy.set(true);
        this.message.set(null);
        const result = await this.panel.activate(user, pass, this.selectedDns);
        if (!result.ok) {
            this.busy.set(false);
            this.say(result.message ?? 'No se pudo iniciar sesión.', 'error');
            return;
        }
        const check = await this.panel.checkDevice();
        const account =
            check.status === 'active'
                ? check.account
                : { server: this.selectedDns, username: user, password: pass, isDemo: false };
        await this.enter(account);
    }

    async autoDemo(): Promise<void> {
        if (this.demoBlocked()) return;
        this.demoBusy.set(true);
        this.message.set(null);
        const demo = await this.panel.autoDemo();
        if (!demo.ok) {
            this.demoBusy.set(false);
            if (demo.blocked) this.demoBlocked.set(true);
            this.say(demo.message, 'error');
            return;
        }
        this.say('Demo activada. Entrando…', 'success');
        const check = await this.panel.checkDevice();
        if (check.status === 'active') {
            await this.enter(check.account);
            return;
        }
        if (!this.dnsList().length) await this.loadDns();
        const server = this.dnsList()[0];
        if (!server) {
            this.demoBusy.set(false);
            this.say('El panel no tiene servidores disponibles.', 'error');
            return;
        }
        await this.enter({ server, username: demo.username, password: demo.password, isDemo: true });
    }

    private async enter(account: Parameters<PanelSessionService['start']>[0]): Promise<void> {
        try {
            await this.session.start(account);
            await this.router.navigate(['/workspace']);
        } catch {
            this.say('No se pudo abrir la sesión.', 'error');
        } finally {
            this.checking.set(false);
            this.busy.set(false);
            this.demoBusy.set(false);
        }
    }

    private say(text: string, kind: MessageKind): void {
        this.message.set({ text, kind });
    }
}
