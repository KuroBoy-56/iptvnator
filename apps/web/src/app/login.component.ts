import { ChangeDetectionStrategy, Component, computed, effect, ElementRef, inject, OnInit, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { LoginPostersService } from './panel-login/login-posters.service';
import { PanelLoginService } from './panel-login/panel-login.service';
import { PanelSessionService } from './panel-login/panel-session.service';
import { PanelTenantService } from './panel-login/panel-tenant.service';
import { SecureDnsPickerComponent } from './panel-login/secure-dns-picker.component';

type MessageKind = 'error' | 'info' | 'success';

/**
 * Login / device activation through the panel (same flow as the Android
 * app): the device id is checked first (check_mac); a new device activates
 * with its line (submit_url) or gets a one-time demo (auto_demo).
 * On the very first launch the distributor step comes first ("Número de
 * distribuidor": Continuar / Omitir); the choice is remembered.
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
    protected readonly tenant = inject(PanelTenantService);
    protected readonly branding = this.tenant.branding;

    readonly posters = signal<string[]>(this.posterService.cached());
    readonly deviceId = signal('');
    readonly checking = signal(true);
    readonly busy = signal(false);
    readonly demoBusy = signal(false);
    readonly demoBlocked = signal(false);
    readonly showPassword = signal(false);
    readonly message = signal<{ text: string; kind: MessageKind } | null>(null);
    readonly dnsList = signal<string[]>([]);
    readonly logoFailed = signal(false);
    /** No distributor choice yet (first launch, or after a wipe / "Cambiar distribuidor"). */
    readonly needsDistributor = computed(() => this.branding.choice() === 'none');
    readonly distBusy = signal(false);
    readonly distError = signal<string | null>(null);
    private deviceCheckStarted = false;
    private readonly distInput = viewChild<ElementRef<HTMLInputElement>>('distInput');

    username = '';
    distCode = '';
    password = '';
    selectedDns = '';

    constructor() {
        // the distributor field gets the focus as soon as the step shows
        effect(() => this.distInput()?.nativeElement.focus());
    }

    async ngOnInit(): Promise<void> {
        void this.posterService.load().then((list) => list.length && this.posters.set(list));
        if (this.needsDistributor() || this.tenant.retryMessage()) return;
        await this.startDeviceCheck();
    }

    /** Keeps only digits (max 6) in the distributor field. */
    onDistInput(event: Event): void {
        const input = event.target as HTMLInputElement;
        this.distCode = input.value.replace(/\D/g, '').slice(0, 6);
        input.value = this.distCode;
    }

    /** Distributor step "Continuar". */
    async continueWithCode(): Promise<void> {
        if (this.distBusy()) return;
        this.distBusy.set(true);
        this.distError.set(null);
        const error = await this.tenant.submit(this.distCode);
        this.distBusy.set(false);
        if (error) {
            this.distError.set(error);
            return;
        }
        this.distCode = '';
        await this.startDeviceCheck(true);
    }

    /** Distributor step "Omitir". */
    async skipDistributor(): Promise<void> {
        this.tenant.skip();
        this.distError.set(null);
        await this.startDeviceCheck(true);
    }

    /** Retry screen: the distributor could not be verified for 72 h. */
    async retryTenant(): Promise<void> {
        this.distBusy.set(true);
        const result = await this.tenant.check();
        this.distBusy.set(false);
        if (result === 'ok' || result === 'offline') {
            this.tenant.retryMessage.set(null);
            await this.startDeviceCheck(true);
        }
    }

    private async startDeviceCheck(restart = false): Promise<void> {
        if (this.deviceCheckStarted && !restart) return;
        this.deviceCheckStarted = true;
        this.message.set(null);
        this.checking.set(true);
        this.demoBlocked.set(false);
        this.dnsList.set([]);
        this.selectedDns = '';

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
