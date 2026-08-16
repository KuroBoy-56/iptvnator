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
            const autoResponse = await firstValueFrom(
                this.http.post<any>(
                    targetUrl,
                    { action: 'auto_login', mac_address: macAddress, device_id: macAddress }
                )
            );

            const validAccounts = (autoResponse && autoResponse.success && autoResponse.accounts) ? autoResponse.accounts : [];
            const playlists = await firstValueFrom(this.store.select(selectAllPlaylistsMeta));
            
            for (const p of playlists) {
                const stillActive = validAccounts.find((a: any) => 
                    a.username === p.username && 
                    a.password === p.password && 
                    normalizeXtreamServerUrl(a.dns) === p.serverUrl
                );

                if (!stillActive) {
                    await this.playlistDeleteAction.deletePlaylist(p);
                    this.store.dispatch(PlaylistActions.removePlaylist({ playlistId: p._id }));
                    localStorage.removeItem(`is_demo_${p._id}`);
                }
            }

            if (autoResponse && autoResponse.success && autoResponse.accounts && autoResponse.accounts.length > 0) {
                const alertAccounts = [];
                let hasChanges = false;

                for (const acc of autoResponse.accounts) {
                    const serverUrl = normalizeXtreamServerUrl(acc.dns);
                    
                    const existingPlaylist = playlists.find(p => 
                        p.serverUrl === serverUrl && 
                        p.username === acc.username && 
                        p.password === acc.password
                    );

                    if (!existingPlaylist) {
                        const newPlaylistId = uuid();
                        if (acc.title === 'DEMO') {
                            localStorage.setItem(`is_demo_${newPlaylistId}`, 'true');
                        }

                        this.store.dispatch(
                            PlaylistActions.addPlaylist({
                                playlist: {
                                    _id: newPlaylistId,
                                    title: acc.title || 'LatMpx Pro+',
                                    username: acc.username,
                                    password: acc.password,
                                    serverUrl: serverUrl,
                                    importDate: new Date().toISOString(),
                                } as Playlist,
                            })
                        );
                        hasChanges = true;
                    }

                    alertAccounts.push({
                        user: acc.username,
                        pass: acc.password,
                        dns: serverUrl,
                        title: acc.title || 'Aviso de Vencimiento'
                    });
                }

                if (alertAccounts.length > 0) {
                    localStorage.setItem('alert_accounts', JSON.stringify(alertAccounts));
                }

                const activeAccount = autoResponse.accounts[0];
                const sessionToken = autoResponse.token || 'token-' + uuid();
                localStorage.setItem('session_token', sessionToken);
                localStorage.setItem('session_date', new Date().getTime().toString());
                localStorage.setItem('session_user', activeAccount.username);

                setTimeout(async () => {
                    const navExitoso = await this.router.navigate(['/workspace']);
                    if (!navExitoso) {
                        this.isLoading = false;
                    }
                }, hasChanges ? 1200 : 800);

            } else {
                if (autoResponse?.message) {
                    this.errorMessage = autoResponse.message;
                }
                this.isLoading = false;
            }
        } catch (error) {
            this.isLoading = false;
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
                const playlists = await firstValueFrom(this.store.select(selectAllPlaylistsMeta));
                const existingPlaylist = playlists.find(p => 
                    p.serverUrl === resolvedServerUrl && 
                    p.username === user && 
                    p.password === pass
                );

                const sessionToken = authResponse.token || 'token-' + uuid();
                localStorage.setItem('session_token', sessionToken);
                localStorage.setItem('session_date', new Date().getTime().toString());
                localStorage.setItem('session_user', user);

                let alertAccountsStr = localStorage.getItem('alert_accounts');
                let alertAccounts = alertAccountsStr ? JSON.parse(alertAccountsStr) : [];
                alertAccounts = alertAccounts.filter((a: any) => !(a.user === user && a.pass === pass && a.dns === resolvedServerUrl));
                alertAccounts.push({
                    user: user,
                    pass: pass,
                    dns: resolvedServerUrl,
                    title: finalTitle
                });
                localStorage.setItem('alert_accounts', JSON.stringify(alertAccounts));

                if (!existingPlaylist) {
                    const newPlaylistId = uuid();

                    if (finalTitle === 'DEMO') {
                        localStorage.setItem(`is_demo_${newPlaylistId}`, 'true');
                    }

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
                } else {
                    if (finalTitle === 'DEMO') {
                        localStorage.setItem(`is_demo_${existingPlaylist._id}`, 'true');
                    }
                }

                try {
                    const syncResponse = await firstValueFrom(
                        this.http.post<any>(targetUrl, { action: 'auto_login', mac_address: macAddress, device_id: macAddress })
                    );
                    const validAccountsSync = (syncResponse && syncResponse.success && syncResponse.accounts) ? syncResponse.accounts : [];
                    const currentPlaylists = await firstValueFrom(this.store.select(selectAllPlaylistsMeta));
                    
                    for (const p of currentPlaylists) {
                        const stillActive = validAccountsSync.find((a: any) => 
                            a.username === p.username && 
                            a.password === p.password && 
                            normalizeXtreamServerUrl(a.dns) === p.serverUrl
                        );

                        if (!stillActive) {
                            await this.playlistDeleteAction.deletePlaylist(p);
                            this.store.dispatch(PlaylistActions.removePlaylist({ playlistId: p._id }));
                            localStorage.removeItem(`is_demo_${p._id}`);
                        }
                    }
                } catch (e) {}

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