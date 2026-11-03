import { ChangeDetectionStrategy, Component, computed, effect, ElementRef, inject, OnInit, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { UiText } from '@iptvnator/shared/interfaces';
import { PortalStatusService } from '@iptvnator/services';
import { pickLineServer } from './panel-login/line-server.util';
import { LoginPostersService } from './panel-login/login-posters.service';
import { PanelLoginService } from './panel-login/panel-login.service';
import { PanelSessionService } from './panel-login/panel-session.service';
import { PanelSessionGuardService } from './panel-login/panel-session-guard.service';
import { SecureDnsPickerComponent } from './panel-login/secure-dns-picker.component';
import { PanelTenantService } from './panel-login/panel-tenant.service';
import { FakeScreenComponent } from './panel-login/fake-screen/fake-screen.component';
import { PanelFakeScreen } from './panel-login/fake-screen/fake-screen.util';
import { ReviewThemeService } from './panel-login/review/review-theme.service';

type MessageKind = 'error' | 'info' | 'success';

const FAKE_UNLOCKED_KEY = 'panel_fake_unlocked';
function fakeUnlocked(): boolean {
    try {
        return localStorage.getItem(FAKE_UNLOCKED_KEY) === '1';
    } catch {
        return false;
    }
}

/**
 * Login / device activation through the panel (same flow as the Android
 * app): the device id is checked first (check_mac); a new device activates
 * with its line (submit_url) or gets a one-time demo (auto_demo). There is no
 * server or DNS selector: the line's server is picked from the panel's DNS
 * list by probing the credentials, and DNS resolution falls back to
 * DNS-over-HTTPS automatically in the Electron main process.
 * On the very first launch the distributor step comes first ("Número de
 * distribuidor": Continuar / Omitir); the choice is remembered.
 */
@Component({
    standalone: true,
    selector: 'app-login',
    templateUrl: './login.component.html',
    styleUrls: ['./login.component.scss'],
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [FormsModule, FakeScreenComponent, TranslatePipe, SecureDnsPickerComponent],
})
export class LoginComponent implements OnInit {
    private readonly panel = inject(PanelLoginService);
    private readonly session = inject(PanelSessionService);
    private readonly guard = inject(PanelSessionGuardService);
    private readonly portalStatus = inject(PortalStatusService);
    private readonly posterService = inject(LoginPostersService);
    private readonly router = inject(Router);
    private readonly reviewTheme = inject(ReviewThemeService);
    protected readonly tenant = inject(PanelTenantService);
    protected readonly branding = this.tenant.branding;

    /** pósters del login: solo los que el panel entrega ahora (nada guardado de antes) */
    readonly posters = signal<string[]>([]);
    readonly deviceId = signal('');
    readonly checking = signal(true);
    readonly busy = signal(false);
    readonly demoBusy = signal(false);
    readonly showPassword = signal(false);
    readonly message = signal<{ text: UiText; kind: MessageKind } | null>(null);
    readonly dnsList = signal<string[]>([]);
    readonly logoFailed = signal(false);
    /** fake screen of the panel for a new device: until the code is typed or it gets registered */
    readonly fakeScreen = signal<PanelFakeScreen | null>(null);
    private fakePoll: ReturnType<typeof setInterval> | null = null;
    /** No distributor choice yet (first launch, or after a wipe / "Cambiar distribuidor"). */
    readonly needsDistributor = computed(() => this.branding.choice() === 'none');
    /** features del panel (demo configurada); null = sin respuesta o panel viejo */
    private readonly panelDemo = signal<boolean | null>(null);
    /** tema de prueba del dueño (features.review, con Omitir): login sencillo, sin DNS ni código del equipo */
    readonly review = signal(false);
    /** equipo en la lista negra del panel: solo el aviso, sin Autodemo */
    readonly blocked = signal(false);
    /** Botón Autodemo: lo que diga features; si no respondió, lo de antes (tenant_config / visible con Omitir) */
    readonly showDemo = computed(() => !this.blocked() && (this.review() || (this.panelDemo() ?? this.branding.features().demo)));
    readonly distBusy = signal(false);
    readonly distError = signal<UiText | null>(null);
    private deviceCheckStarted = false;
    private readonly distInput = viewChild<ElementRef<HTMLInputElement>>('distInput');

    username = '';
    distCode = '';
    password = '';

    constructor() {
        // the distributor field gets the focus as soon as the step shows
        effect(() => this.distInput()?.nativeElement.focus());
    }

    async ngOnInit(): Promise<void> {
        this.loadPosters();
        if (this.needsDistributor() || this.tenant.retryMessage()) return;
        await this.startDeviceCheck();
    }

    /** the panel decides: without its TMDB key (owner or distributor) there is no poster wall */
    private loadPosters(): void {
        void this.posterService.load().then((list) => this.posters.set(list));
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
        this.loadPosters();
        await this.startDeviceCheck(true);
    }

    /** «Cambiar distribuidor» del login (siempre visible): olvida el anterior y vuelve al paso del número. */
    async chooseDistributor(): Promise<void> {
        this.posters.set([]);
        this.panelDemo.set(null);
        await this.tenant.change();
    }

    /** Distributor step "Omitir". */
    async skipDistributor(): Promise<void> {
        this.tenant.skip();
        this.distError.set(null);
        this.loadPosters();
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
        this.blocked.set(false);
        this.checking.set(true);
        this.dnsList.set([]);

        if (!this.panel.available) {
            this.checking.set(false);
            this.say({ key: 'MPX.PANEL.ERR_DESKTOP_ONLY' }, 'error');
            return;
        }

        // features: el botón Autodemo solo si el panel tiene una demo configurada
        this.panelDemo.set(null);
        this.review.set(false);
        void this.panel.demoAvailable().then((demo) => {
            this.panelDemo.set(demo);
            this.review.set(this.panel.reviewOffered);
        });
        this.deviceId.set(await this.panel.deviceId());
        const check = await this.panel.checkDevice();
        if (check.status === 'active') {
            // the panel line is checked on the IPTV server before entering (wrong password or expired: no entry)
            const st = await this.portalStatus.checkPortalStatus(check.account.server, check.account.username, check.account.password, { skipCache: true });
            if (st === 'expired' || st === 'inactive') {
                await this.session.clear();
                this.checking.set(false);
                this.say({ key: st === 'expired' ? 'MPX.LOGIN.ERR_EXPIRED' : 'MPX.LOGIN.ERR_INVALID_LINE' }, 'error');
                await this.loadDns();
                return;
            }
            this.say({ key: 'MPX.LOGIN.DEVICE_ACTIVE' }, 'success');
            await this.enter(check.account);
            return;
        }
        if (check.status === 'blocked') {
            // lista negra del panel: el aviso, sin pantalla falsa ni línea guardada
            await this.session.clear();
            this.blocked.set(true);
            this.say(check.message, 'error');
        } else if (check.status === 'error') {
            this.say(check.message, 'error');
        } else {
            await this.session.clear();
            if (check.fake && !fakeUnlocked()) this.showFake(check.fake);
        }
        this.checking.set(false);
        await this.loadDns();
    }

    private showFake(f: PanelFakeScreen): void {
        this.fakeScreen.set(f);
        if (this.fakePoll) return;
        // every 30 s: once the distributor registers this device the app opens by itself
        this.fakePoll = setInterval(async () => {
            const c = await this.panel.checkDevice();
            if (c.status === 'active') {
                this.hideFake();
                await this.enter(c.account);
            } else if (c.status === 'inactive' && !c.fake) {
                this.hideFake();
            } else if (c.status === 'blocked') {
                this.hideFake();
                this.blocked.set(true);
                this.say(c.message, 'error');
            }
        }, 30_000);
    }

    hideFake(unlocked = false): void {
        if (unlocked) {
            try {
                localStorage.setItem(FAKE_UNLOCKED_KEY, '1');
            } catch {
                /* storage blocked */
            }
        }
        if (this.fakePoll) clearInterval(this.fakePoll);
        this.fakePoll = null;
        this.fakeScreen.set(null);
    }

    private async loadDns(): Promise<string[]> {
        if (!this.dnsList().length) this.dnsList.set(await this.panel.fetchDns());
        return this.dnsList();
    }

    /** The panel DNS that serves this line (no selector on screen). */
    private async lineServer(user: string, pass: string): Promise<string | null> {
        return pickLineServer(await this.loadDns(), (server) =>
            this.portalStatus.checkPortalStatus(server, user, pass, { skipCache: true })
        );
    }

    async login(): Promise<void> {
        const user = this.username.trim();
        const pass = this.password.trim();
        if (!user || !pass) {
            this.say({ key: 'MPX.LOGIN.ERR_EMPTY' }, 'error');
            return;
        }
        this.busy.set(true);
        this.message.set(null);
        // tema de prueba: una cuenta del tema entra al tema; cualquier otra sigue como siempre (línea IPTV)
        if (this.review() && (await this.openReview(user, pass, false))) return;
        const server = await this.lineServer(user, pass);
        if (!server) {
            this.busy.set(false);
            this.say({ key: 'MPX.LOGIN.ERR_NO_SERVERS' }, 'error');
            return;
        }
        const result = await this.panel.activate(user, pass, server);
        if (!result.ok) {
            this.busy.set(false);
            if (result.blocked) this.blocked.set(true);
            this.say(result.message ?? { key: 'MPX.LOGIN.ERR_LOGIN' }, 'error');
            return;
        }
        const check = await this.panel.checkDevice();
        const account =
            check.status === 'active'
                ? check.account
                : { server, username: user, password: pass, isDemo: false };
        await this.enter(account);
    }

    /** true = entró al tema de prueba (review_login); no registra nada en el panel ni vence */
    private async openReview(user: string, pass: string, demo: boolean): Promise<boolean> {
        const r = await this.panel.reviewLogin(user, pass, demo);
        if (r.ok) {
            this.reviewTheme.open(r.content);
            this.busy.set(false);
            this.demoBusy.set(false);
            await this.router.navigate(['/review']);
            return true;
        }
        if (demo) this.say(r.message, 'error');
        return false;
    }

    async autoDemo(): Promise<void> {
        this.demoBusy.set(true);
        this.message.set(null);
        if (this.review()) {
            // Auto-Demo del tema de prueba: sin crear ni registrar ninguna demo
            if (!(await this.openReview('', '', true))) this.demoBusy.set(false);
            return;
        }
        // a reseller demo code typed in "Contraseña" registers the demo under that reseller
        const demo = await this.panel.autoDemo(this.password);
        if (!demo.ok) {
            this.demoBusy.set(false);
            // no local block: the panel decides on every try (a deleted demo can ask again)
            if (demo.device) this.blocked.set(true);
            this.say(demo.message, 'error');
            return;
        }
        this.say({ key: 'MPX.LOGIN.DEMO_ACTIVE' }, 'success');
        // the demo's own server first (the session tries http and https on it)
        if (demo.url) {
            await this.enter({
                server: demo.url,
                username: demo.username,
                password: demo.password,
                isDemo: true,
                demoExpires: demo.expires,
                demoDuration: demo.duration,
            });
            return;
        }
        const check = await this.panel.checkDevice();
        if (check.status === 'active') {
            await this.enter(check.account);
            return;
        }
        const [server] = await this.loadDns();
        if (!server) {
            this.demoBusy.set(false);
            this.say({ key: 'MPX.LOGIN.ERR_NO_SERVERS' }, 'error');
            return;
        }
        await this.enter({
            server,
            username: demo.username,
            password: demo.password,
            isDemo: true,
            demoExpires: demo.expires,
            demoDuration: demo.duration,
        });
    }

    private async enter(account: Parameters<PanelSessionService['start']>[0]): Promise<void> {
        try {
            await this.session.start(account);
            this.guard.watch(account);
            await this.router.navigate(['/workspace']);
        } catch {
            this.say({ key: 'MPX.LOGIN.ERR_SESSION' }, 'error');
        } finally {
            this.checking.set(false);
            this.busy.set(false);
            this.demoBusy.set(false);
        }
    }

    private say(text: UiText, kind: MessageKind): void {
        this.message.set({ text, kind });
    }
}
