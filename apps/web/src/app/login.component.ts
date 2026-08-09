import { Component, inject, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Store } from '@ngrx/store';
import { firstValueFrom } from 'rxjs';
import { PlaylistActions, selectAllPlaylistsMeta } from '@iptvnator/m3u-state';
import { PortalStatusService, PlaylistDeleteActionService } from '@iptvnator/services';
import { normalizeXtreamServerUrl, Playlist } from '@iptvnator/shared/interfaces';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { v4 as uuid } from 'uuid';

@Component({
    standalone: true,
    selector: 'app-login',
    templateUrl: './login.component.html',
    styleUrls: ['./login.component.scss'],
    imports: [CommonModule, FormsModule]
})
export class LoginComponent implements OnInit {
    isLoading = true; 
    isPasswordVisible = false;
    isDemoPanelOpen = false;
    errorMessage: string | null = null; 
    isSuccessMessage = false;

    private readonly http = inject(HttpClient);
    private readonly store = inject(Store);
    private readonly router = inject(Router);
    private readonly portalStatusService = inject(PortalStatusService);
    private readonly playlistDeleteAction = inject(PlaylistDeleteActionService);

    async ngOnInit() {
        const targetUrl = this.getApiUrl();
        const macAddress = await this.getPcMacAddress();

        try {
            // EL AUTO-LOGIN AHORA FUNCIONARÁ PORQUE LA MAC TIENE EL "PC:" ORIGINAL
            const autoResponse = await firstValueFrom(
                this.http.post<{ success: boolean; username?: string; password?: string; message?: string; title?: string }>(
                    targetUrl,
                    { action: 'auto_login', mac_address: macAddress, device_id: macAddress }
                )
            );

            if (autoResponse && autoResponse.success && autoResponse.username && autoResponse.password) {
                await this.login(autoResponse.username, autoResponse.password, autoResponse.title);
            } else {
                await this.nukeOldPlaylists();
                if (autoResponse?.message) {
                    this.errorMessage = autoResponse.message;
                }
                this.isLoading = false;
            }
        } catch (error) {
            await this.nukeOldPlaylists();
            this.isLoading = false;
        }
    }

    private async nukeOldPlaylists(): Promise<void> {
        try {
            const playlists = await firstValueFrom(this.store.select(selectAllPlaylistsMeta));
            for (const p of playlists) {
                await this.playlistDeleteAction.deletePlaylist(p);
                this.store.dispatch(PlaylistActions.removePlaylist({ playlistId: p._id }));
            }
            localStorage.removeItem('session_token');
            localStorage.removeItem('session_date');
            localStorage.removeItem('session_user');
            
            Object.keys(localStorage).forEach(key => {
                if (key.startsWith('is_demo_')) {
                    localStorage.removeItem(key);
                }
            });
        } catch (e) {
        }
    }

    private getApiUrl(): string {
        const encrypted = [3, 1, 6, 31, 24, 79, 93, 64, 12, 20, 0, 10, 29, 12, 28, 31, 10, 27, 23, 3, 24, 91, 30, 14, 31, 24, 2, 23, 69, 22, 29, 2, 68, 5, 30, 14, 18, 16, 0, 48, 27, 22, 45, 14, 27, 28, 92, 31, 3, 5];
        const key = "kuro";
        let decrypted = "";
        for (let i = 0; i < encrypted.length; i++) {
            decrypted += String.fromCharCode(encrypted[i] ^ key.charCodeAt(i % key.length));
        }
        return decrypted;
    }

    private getDemoApiUrl(): string {
        const encrypted = [3, 1, 6, 31, 24, 79, 93, 64, 12, 20, 0, 10, 29, 12, 28, 31, 10, 27, 23, 3, 24, 91, 30, 14, 31, 24, 2, 23, 69, 22, 29, 2, 68, 28, 16, 0, 95, 30, 2, 29, 4, 90, 19, 31, 2, 90, 22, 10, 6, 26, 45, 31, 25, 26, 10, 22, 52, 5, 17, 65, 27, 29, 2];
        const key = "kuro";
        let decrypted = "";
        for (let i = 0; i < encrypted.length; i++) {
            decrypted += String.fromCharCode(encrypted[i] ^ key.charCodeAt(i % key.length));
        }
        return decrypted;
    }

    private async getPcMacAddress(): Promise<string> {
        let deviceId = localStorage.getItem('pc_hardware_id');
        
        // BORRAMOS FORMATOS INVENTADOS (los que no tienen PC:) PARA VOLVER AL ORIGINAL
        if (deviceId && !deviceId.includes('PC:')) {
            localStorage.removeItem('pc_hardware_id');
            deviceId = null;
        }

        if (!deviceId) {
            try {
                const win = window as any;
                if (win.electron && win.electron.getHardwareId) {
                    const realId = await win.electron.getHardwareId();
                    if (realId) {
                        deviceId = `PC:${realId}`;
                    }
                }
            } catch (e) {}
            
            // GENERADOR DE MAC RESTAURADO AL ORIGINAL "PC:XX.XX..."
            if (!deviceId) {
                const hex = () => Math.floor(Math.random() * 256).toString(16).padStart(2, '0').toUpperCase();
                deviceId = `PC:${hex()}.${hex()}.${hex()}.${hex()}.${hex()}.${hex()}.${hex()}.${hex()}`;
            }
            localStorage.setItem('pc_hardware_id', deviceId);
        }
        return deviceId;
    }

    togglePasswordVisibility(): void {
        this.isPasswordVisible = !this.isPasswordVisible;
    }

    toggleDemoPanel(): void {
        this.isDemoPanelOpen = !this.isDemoPanelOpen;
    }

    async activateDemo(codeValue: string) {
        this.errorMessage = null;
        this.isSuccessMessage = false;

        let code = '';
        if (this.isDemoPanelOpen && codeValue) {
            code = codeValue.trim();
        }

        this.isLoading = true;
        const macAddress = await this.getPcMacAddress();
        const demoUrl = this.getDemoApiUrl();
        
        try {
            const urlWithParams = `${demoUrl}?device_id=${encodeURIComponent(macAddress)}&dns_id=${encodeURIComponent(code)}`;
            const rawResponse = await firstValueFrom(
                this.http.get(urlWithParams, { responseType: 'text' })
            );

            let response;
            try {
                response = JSON.parse(rawResponse);
            } catch (e) {
                throw new Error();
            }

            if (!response || !response.success) {
                this.errorMessage = response?.message || '';
                this.isLoading = false;
                return;
            }

            this.isSuccessMessage = true;
            this.errorMessage = response.message;

            if (response.username && response.password) {
                setTimeout(async () => {
                    await this.login(response.username!, response.password!, "DEMO");
                }, 1500);
            } else {
                this.isLoading = false;
            }

        } catch (error: any) {
            if (error instanceof HttpErrorResponse) {
                this.errorMessage = `Error Status ${error.status} - ${error.statusText}`;
            } else {
                this.errorMessage = `Error: ${error.message}`;
            }
            this.isLoading = false;
        }
    }

    async login(userValue: string, passValue: string, dynamicTitle?: string) {
        this.errorMessage = null;
        this.isSuccessMessage = false;

        const user = userValue?.trim();
        const pass = passValue?.trim();

        if (!user || !pass) {
            this.errorMessage = '';
            return;
        }

        this.isLoading = true;
        const macAddress = await this.getPcMacAddress();
        const targetUrl = this.getApiUrl();

        try {
            const rawResponse = await firstValueFrom(
                this.http.post(targetUrl, 
                    { username: user, password: pass, mac_address: macAddress, device_id: macAddress },
                    { responseType: 'text' }
                )
            );

            let authResponse;
            try {
                authResponse = JSON.parse(rawResponse);
            } catch (e) {
                throw new Error();
            }

            if (!authResponse || !authResponse.success || !authResponse.dns) {
                await this.nukeOldPlaylists();
                this.errorMessage = authResponse?.message || '';
                this.isLoading = false;
                return;
            }

            const resolvedServerUrl = normalizeXtreamServerUrl(authResponse.dns);
            const finalTitle = dynamicTitle || authResponse.title || 'LatMpx Pro+';

            const connectionStatus = await this.portalStatusService.checkPortalStatus(
                resolvedServerUrl,
                user,
                pass,
                { skipCache: true }
            );

            if (connectionStatus === 'active') {
                await this.nukeOldPlaylists();

                const newPlaylistId = uuid();

                if (finalTitle === 'DEMO') {
                    localStorage.setItem(`is_demo_${newPlaylistId}`, 'true');
                }

                const sessionToken = authResponse.token || 'token-' + uuid();
                localStorage.setItem('session_token', sessionToken);
                localStorage.setItem('session_date', new Date().getTime().toString());
                localStorage.setItem('session_user', user);

                this.store.dispatch(
                    PlaylistActions.addPlaylist({
                        playlist: {
                            _id: newPlaylistId,
                            title: finalTitle,
                            username: user,
                            password: pass,
                            serverUrl: resolvedServerUrl,
                            importDate: new Date().toISOString(),
                        } as Playlist,
                    })
                );

                setTimeout(async () => {
                    const navExitoso = await this.router.navigate(['/workspace']);
                    if (!navExitoso) {
                        this.isLoading = false;
                    }
                }, 800);

            } else {
                this.errorMessage = '';
                this.isLoading = false;
            }

        } catch (error: any) {
            if (error instanceof HttpErrorResponse) {
                this.errorMessage = `Error Status ${error.status}`;
            } else {
                this.errorMessage = `Error: ${error.message}`;
            }
            this.isLoading = false;
        }
    }
}