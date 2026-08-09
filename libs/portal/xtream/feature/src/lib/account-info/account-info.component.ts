import {
    ChangeDetectionStrategy,
    Component,
    computed,
    inject,
    signal,
} from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { TranslatePipe } from '@ngx-translate/core';
import {
    XtreamAccountInfo,
    XtreamApiService,
    XtreamStore,
} from '@iptvnator/portal/xtream/data-access';
import { createLogger } from '@iptvnator/portal/shared/util';
import {
    resolveXtreamPortalStatus,
    type XtreamAccountInfoDialogData,
} from '@iptvnator/shared/interfaces';

type AccountLoadState = 'loading' | 'ready' | 'error';

interface AccountStat {
    icon: string;
    labelKey: string;
    value: string;
    meter: number | null;
}

interface AccountDetailRow {
    labelKey: string;
    value: string;
    mono?: boolean;
    tone?: 'accent' | 'positive' | 'warning';
    translateValue?: boolean;
}

interface AccountPort {
    labelKey: string;
    value: string;
}

@Component({
    selector: 'app-account-info',
    imports: [MatButtonModule, MatDialogModule, MatIconModule, TranslatePipe],
    templateUrl: './account-info.component.html',
    styleUrl: './account-info.component.scss',
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AccountInfoComponent {
    readonly data =
        inject<XtreamAccountInfoDialogData | null>(MAT_DIALOG_DATA, {
            optional: true,
        }) ?? {};
    private readonly xtreamApiService = inject(XtreamApiService);
    private readonly xtreamStore = inject(XtreamStore);
    private readonly http = inject(HttpClient);
    private readonly logger = createLogger('XtreamAccountInfo');

    readonly currentPlaylist = computed(
        () => this.data.playlist ?? this.xtreamStore.currentPlaylist()
    );
    readonly loadState = signal<AccountLoadState>('loading');
    readonly accountInfo = signal<XtreamAccountInfo | null>(null);
    readonly skeletonStats = [1, 2, 3, 4];
    readonly skeletonPanels = [1, 2];

    readonly isActive = computed(
        () => resolveXtreamPortalStatus(this.accountInfo()) === 'active'
    );
    
    // LECTURA DEL MARCADOR INDESTRUCTIBLE (Saltando la regla estricta de TypeScript)
    readonly isTrial = computed(() => {
        const playlist = this.currentPlaylist();
        const info = this.accountInfo();
        const pid = (playlist as any)?._id || (playlist as any)?.id;
        const isSessionDemo = pid ? localStorage.getItem(`is_demo_${pid}`) === 'true' : false;
        
        return info?.user_info?.is_trial === '1' || playlist?.title === 'DEMO' || isSessionDemo;
    });

    readonly playlistLabel = computed(() => {
        if (this.isTrial()) return 'DEMO';
        const playlist = this.currentPlaylist();
        const info = this.accountInfo();
        return (
            playlist?.title ||
            playlist?.name ||
            info?.server_info?.url ||
            info?.user_info?.username ||
            '-'
        );
    });

    readonly serverHost = computed(() => {
        if (this.isTrial()) return '***************';
        return this.accountInfo()?.server_info?.url || '-';
    });

    readonly activeConnections = computed(() =>
        this.parseNumber(this.accountInfo()?.user_info?.active_cons)
    );
    readonly maxConnections = computed(() =>
        this.parseNumber(this.accountInfo()?.user_info?.max_connections)
    );
    
    readonly connectionUsagePercent = computed(() => {
        if (this.isTrial()) return 100;
        const maxConnections = this.maxConnections();
        if (maxConnections <= 0) return 0;
        return Math.min(100, Math.round((this.activeConnections() / maxConnections) * 100));
    });

    readonly activeConnectionsLabel = computed(() => {
        if (this.isTrial()) return '1/1';
        return `${this.activeConnections()}/${Math.max(this.maxConnections(), 0)}`;
    });

    readonly formattedExpDate = computed(() => {
        return this.formatUnixDate(this.accountInfo()?.user_info?.exp_date);
    });
    readonly formattedCreatedDate = computed(() => {
        return this.formatUnixDate(this.accountInfo()?.user_info?.created_at);
    });

    readonly allowedFormats = computed(
        () => this.accountInfo()?.user_info?.allowed_output_formats ?? []
    );
    
    readonly ports = computed<AccountPort[]>(() => {
        const serverInfo = this.accountInfo()?.server_info;
        return [
            {
                labelKey: 'XTREAM.ACCOUNT_INFO.HTTP_PORT',
                value: serverInfo?.port || '-',
            },
            {
                labelKey: 'XTREAM.ACCOUNT_INFO.HTTPS_PORT',
                value: serverInfo?.https_port || '-',
            },
            {
                labelKey: 'XTREAM.ACCOUNT_INFO.RTMP_PORT',
                value: serverInfo?.rtmp_port || '-',
            },
        ];
    });
    
    readonly heroStats = computed<AccountStat[]>(() => [
        {
            icon: 'bolt',
            labelKey: 'XTREAM.ACCOUNT_INFO.ACTIVE_CONNECTIONS',
            value: this.activeConnectionsLabel(),
            meter: this.connectionUsagePercent(),
        },
        {
            icon: 'live_tv',
            labelKey: 'XTREAM.ACCOUNT_INFO.LIVE_TV',
            value: this.formatOptionalCount(this.data.liveStreamsCount),
            meter: null,
        },
        {
            icon: 'movie',
            labelKey: 'XTREAM.ACCOUNT_INFO.MOVIES',
            value: this.formatOptionalCount(this.data.vodStreamsCount),
            meter: null,
        },
        {
            icon: 'tv',
            labelKey: 'XTREAM.ACCOUNT_INFO.TV_SERIES',
            value: this.formatOptionalCount(this.data.seriesCount),
            meter: null,
        },
    ]);
    
    readonly userDetails = computed<AccountDetailRow[]>(() => {
        const isDemo = this.isTrial();
        const rows: AccountDetailRow[] = [
            {
                labelKey: 'XTREAM.ACCOUNT_INFO.STATUS',
                value: this.accountInfo()?.user_info?.status || '-',
                tone: this.isActive() ? 'positive' : undefined,
            },
            {
                labelKey: 'XTREAM.ACCOUNT_INFO.USERNAME',
                value: isDemo ? 'DEMO' : (this.accountInfo()?.user_info?.username || '-'),
                mono: true,
            },
            {
                labelKey: 'XTREAM.ACCOUNT_INFO.ACTIVE_CONNECTIONS',
                value: this.activeConnectionsLabel(),
                tone: 'accent',
            }
        ];

        if (!isDemo) {
            rows.push({
                labelKey: 'XTREAM.ACCOUNT_INFO.CREATED',
                value: this.formattedCreatedDate(),
            });
            rows.push({
                labelKey: 'XTREAM.ACCOUNT_INFO.EXPIRES',
                value: this.formattedExpDate(),
            });
        }

        rows.push({
            labelKey: 'XTREAM.ACCOUNT_INFO.TRIAL_ACCOUNT',
            value: isDemo ? 'XTREAM.ACCOUNT_INFO.YES' : 'XTREAM.ACCOUNT_INFO.NO',
            translateValue: true,
            tone: isDemo ? 'warning' : undefined,
        });

        return rows;
    });
    
    readonly serverDetails = computed<AccountDetailRow[]>(() => [
        {
            labelKey: 'XTREAM.ACCOUNT_INFO.URL',
            value: this.isTrial() ? '***************' : (this.accountInfo()?.server_info?.url || '-'),
            mono: true,
        },
        {
            labelKey: 'XTREAM.ACCOUNT_INFO.PROTOCOL',
            value: this.accountInfo()?.server_info?.server_protocol || '-',
        },
        {
            labelKey: 'XTREAM.ACCOUNT_INFO.TIMEZONE',
            value: this.accountInfo()?.server_info?.timezone || '-',
        },
        {
            labelKey: 'XTREAM.ACCOUNT_INFO.SERVER_TIME',
            value: this.accountInfo()?.server_info?.time_now || '-',
            mono: true,
        },
    ]);

    constructor() {
        void this.reload();
    }

    async reload(): Promise<void> {
        const playlist = this.currentPlaylist();
        if (!playlist?.serverUrl || !playlist.username || !playlist.password) {
            this.loadState.set('error');
            this.accountInfo.set(null);
            return;
        }

        this.loadState.set('loading');
        try {
            let rawAccountInfo = await this.xtreamApiService.getAccountInfo({
                serverUrl: playlist.serverUrl,
                username: playlist.username,
                password: playlist.password,
            });

            let accountInfo = JSON.parse(JSON.stringify(rawAccountInfo));
            
            const pid = (playlist as any)?._id || (playlist as any)?.id;
            const isSessionDemo = pid ? localStorage.getItem(`is_demo_${pid}`) === 'true' : false;
            const isDemo = playlist.title === 'DEMO' || accountInfo?.user_info?.is_trial === '1' || isSessionDemo;

            if (isDemo && accountInfo?.user_info && accountInfo?.server_info) {
                accountInfo.user_info.is_trial = '1';
                accountInfo.user_info.username = 'DEMO';
                accountInfo.user_info.password = '**********';
                accountInfo.server_info.url = '***************';
                accountInfo.server_info.port = '***';
                accountInfo.server_info.https_port = '***';
                accountInfo.server_info.rtmp_port = '***';
                
                accountInfo.user_info.active_cons = '1';
                accountInfo.user_info.max_connections = '1';
            }

            this.accountInfo.set(accountInfo);
            this.loadState.set('ready');
        } catch (error) {
            this.logger.error('Failed to fetch account info', error);
            this.accountInfo.set(null);
            this.loadState.set('error');
        }
    }

    private formatUnixDate(timestamp?: string): string {
        const value = Number.parseInt(timestamp ?? '', 10);
        if (!Number.isFinite(value) || value <= 0) {
            return '-';
        }
        
        const dateMs = value < 10000000000 ? value * 1000 : value;
        
        return new Date(dateMs).toLocaleString('es-PA', { 
            timeZone: 'America/Panama',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: true
        });
    }

    private parseNumber(value?: string): number {
        const parsed = Number.parseInt(value ?? '', 10);
        return Number.isFinite(parsed) ? parsed : 0;
    }

    private formatOptionalCount(value?: number): string {
        return Number.isFinite(value) ? String(value) : '-';
    }
}