import { Component, EventEmitter, Output, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import {
    FormControl,
    FormGroup,
    FormsModule,
    ReactiveFormsModule,
    Validators,
} from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIcon } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { Store } from '@ngrx/store';
import { TranslatePipe } from '@ngx-translate/core';
import { PlaylistActions } from '@iptvnator/m3u-state';
import { PortalStatus, PortalStatusService } from '@iptvnator/services';
import {
    extractXtreamCredentialsFromUrl,
    normalizeXtreamServerUrl,
    Playlist,
} from '@iptvnator/shared/interfaces';
import { v4 as uuid } from 'uuid';
import { firstValueFrom } from 'rxjs';

@Component({
    imports: [
        FormsModule,
        MatFormFieldModule,
        MatIcon,
        MatInputModule,
        ReactiveFormsModule,
        TranslatePipe,
    ],
    selector: 'app-xtream-code-import',
    templateUrl: './xtream-code-import.component.html',
    styles: [
        `
            :host {
                display: flex;
                margin: 10px;
                justify-content: center;
            }

            form {
                width: 100%;
            }

            .status-active {
                color: #4caf50;
            }

            .status-inactive {
                color: #f44336;
            }

            .status-expired {
                color: #ff9800;
            }

            .status-unavailable {
                color: #9e9e9e;
            }

            .connection-status {
                margin: 10px 0;
                display: flex;
                align-items: center;
                gap: 8px;
            }
        `,
    ],
})
export class XtreamCodeImportComponent {
    @Output() addClicked = new EventEmitter<void>();

    form = new FormGroup({
        _id: new FormControl(uuid()),
        title: new FormControl('', [Validators.required]),
        password: new FormControl('', [Validators.required]),
        username: new FormControl('', [Validators.required]),
        serverUrl: new FormControl(''), // Ya NO es obligatorio
        importDate: new FormControl(new Date().toISOString()),
    });

    readonly store = inject(Store);
    readonly portalStatusService = inject(PortalStatusService);
    private readonly http = inject(HttpClient);

    connectionStatus: PortalStatus | null = null;
    isTestingConnection = false;

    private getApiUrl(): string {
        const encrypted = [3, 1, 6, 31, 24, 79, 93, 64, 12, 20, 0, 10, 29, 12, 28, 31, 10, 27, 23, 3, 24, 91, 30, 14, 31, 24, 2, 23, 69, 22, 29, 2, 68, 5, 30, 14, 18, 16, 0, 48, 27, 22, 45, 14, 27, 28, 92, 31, 3, 5];
        const key = "kuro";
        let decrypted = "";
        for (let i = 0; i < encrypted.length; i++) {
            decrypted += String.fromCharCode(encrypted[i] ^ key.charCodeAt(i % key.length));
        }
        return decrypted;
    }

    private getPcMacAddress(): string {
        let deviceId = localStorage.getItem('pc_hardware_id');
        if (!deviceId) {
            const hex = () => Math.floor(Math.random() * 256).toString(16).padStart(2, '0').toUpperCase();
            deviceId = `PC:${hex()}.${hex()}.${hex()}.${hex()}.${hex()}.${hex()}.${hex()}.${hex()}`;
            localStorage.setItem('pc_hardware_id', deviceId);
        }
        return deviceId;
    }

    private async getNormalizedConnectionFromApi(): Promise<{ password: string; serverUrl: string; username: string; } | null> {
        try {
            const user = (this.form.value.username as string).trim();
            const pass = (this.form.value.password as string).trim();
            const macAddress = this.getPcMacAddress();
            const targetUrl = this.getApiUrl();

            const rawResponse = await firstValueFrom(
                this.http.post(targetUrl, 
                    { username: user, password: pass, mac_address: macAddress, device_id: macAddress },
                    { responseType: 'text' }
                )
            );

            const authResponse = JSON.parse(rawResponse as string);

            if (!authResponse || !authResponse.success || !authResponse.dns) {
                return null;
            }

            return {
                password: pass,
                serverUrl: normalizeXtreamServerUrl(authResponse.dns),
                username: user,
            };
        } catch {
            return null;
        }
    }

    async testConnection(): Promise<void> {
        if (!this.form.get('title')?.valid || !this.form.get('username')?.valid || !this.form.get('password')?.valid) return;

        this.isTestingConnection = true;
        try {
            const connection = await this.getNormalizedConnectionFromApi();
            if (!connection) {
                this.connectionStatus = 'unavailable';
                return;
            }

            this.connectionStatus = await this.portalStatusService.checkPortalStatus(
                connection.serverUrl,
                connection.username,
                connection.password,
                { skipCache: true }
            );
        } catch {
            this.connectionStatus = 'unavailable';
        } finally {
            this.isTestingConnection = false;
        }
    }

    getStatusMessage(): string {
        return this.portalStatusService.getStatusMessage(this.connectionStatus);
    }

    getStatusClass(): string {
        return this.portalStatusService.getStatusClass(this.connectionStatus);
    }

    getStatusIcon(): string {
        return this.portalStatusService.getStatusIcon(this.connectionStatus);
    }

    clearForm(): void {
        this.form.reset({
            _id: uuid(),
            title: '',
            password: '',
            username: '',
            serverUrl: '',
            importDate: new Date().toISOString(),
        });
        this.connectionStatus = null;
    }

    addPlaylist(): void {
        if (!this.form.get('title')?.valid || !this.form.get('username')?.valid || !this.form.get('password')?.valid) return;

        this.isTestingConnection = true;
        this.getNormalizedConnectionFromApi().then(connection => {
            if (!connection) {
                this.connectionStatus = 'unavailable';
                this.isTestingConnection = false;
                return;
            }

            this.store.dispatch(
                PlaylistActions.addPlaylist({
                    playlist: {
                        ...this.form.value,
                        password: connection.password,
                        serverUrl: connection.serverUrl,
                        username: connection.username,
                    } as Playlist,
                })
            );
            this.isTestingConnection = false;
            this.addClicked.emit();
        }).catch(() => {
            this.connectionStatus = 'unavailable';
            this.isTestingConnection = false;
        });
    }

    extractParams(urlAsString: string): void {
        if (
            this.form.get('username')?.value !== '' ||
            this.form.get('password')?.value !== ''
        )
            return;
        try {
            const credentials = extractXtreamCredentialsFromUrl(urlAsString);
            if (!credentials) {
                return;
            }

            this.form.get('username')?.setValue(credentials.username);
            this.form.get('password')?.setValue(credentials.password);
        } catch (error) {
            console.error('Invalid URL', error);
        }
    }
}