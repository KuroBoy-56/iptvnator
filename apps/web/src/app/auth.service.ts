import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, firstValueFrom } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  public offlineWarning$ = new BehaviorSubject(false);

  constructor(private http: HttpClient) {}

  private getApiUrl(): string {
    const secretKey = 'kuro';
    const binData = [
      '00000011', '00000001', '00000110', '00011111', '00011000', '01001111', '01011101', '01000000',
      '00001100', '00010100', '00000000', '00001010', '00011101', '00001100', '00011100', '00011111',
      '00001010', '00011011', '00010111', '00000011', '00011000', '01011011', '00011110', '00001110',
      '00011111', '00011000', '00000010', '00010111', '01000101', '00010110', '00011101', '00000010',
      '01000100', '00000101', '00011110', '00001110', '00010010', '00010000', '00000000', '00110000',
      '00011011', '00010110', '00101101', '00001110', '00011011', '00011100', '01011100', '00011111',
      '00000011', '00000101'
    ];

    let url = '';
    for (let i = 0; i < binData.length; i++) {
      const encryptedByte = parseInt(binData[i], 2);
      const keyChar = secretKey.charCodeAt(i % secretKey.length);
      url += String.fromCharCode(encryptedByte ^ keyChar);
    }
    return url; 
  }

  private getPcMacAddress(): string {
    try {
      const os = (window as any).require('os');
      const networkInterfaces = os.networkInterfaces();
      
      for (const key in networkInterfaces) {
        const netInterface = networkInterfaces[key];
        for (const net of netInterface) {
          if (!net.internal && net.mac && net.mac !== '00:00:00:00:00:00') {
            return net.mac; 
          }
        }
      }
    } catch (e) {
      console.warn('Módulo OS bloqueado. Usando ID de respaldo.');
    }

    let deviceId = localStorage.getItem('pc_hardware_id');
    if (!deviceId) {
      deviceId = 'PC-' + Math.random().toString(36).substring(2, 10).toUpperCase();
      localStorage.setItem('pc_hardware_id', deviceId);
    }
    return deviceId;
  }

  async login(username: string, password: string): Promise<boolean> {
    try {
      const url = this.getApiUrl();
      const macAddress = this.getPcMacAddress();

      const payload = { username, password, mac_address: macAddress };
      console.log('Enviando petición de login a:', url);

      const response: any = await firstValueFrom(this.http.post(url, payload));
      console.log('Respuesta del servidor:', response);

      if (response && response.success) {
        localStorage.setItem('session_token', response.token);
        localStorage.setItem('session_date', new Date().getTime().toString());
        localStorage.setItem('session_user', username);
        this.offlineWarning$.next(false);
        return true;
      }
      return false;
    } catch (error) {
      console.error('Error detallado en la petición HTTP:', error);
      return this.checkOfflineCache();
    }
  }

  async verifySessionActive(): Promise<boolean> {
    const token = localStorage.getItem('session_token');
    if (!token) return false;
    return this.checkOfflineCache();
  }

  private checkOfflineCache(): boolean {
    const sessionDate = localStorage.getItem('session_date');
    if (!sessionDate) return false;

    const now = new Date().getTime();
    const lastSession = parseInt(sessionDate, 10);
    const daysPassed = (now - lastSession) / (1000 * 60 * 60 * 24);

    if (daysPassed <= 7) {
      this.offlineWarning$.next(true);
      return true; 
    }
    
    this.logout();
    return false;
  }

  logout() {
    localStorage.removeItem('session_token');
    localStorage.removeItem('session_date');
    localStorage.removeItem('session_user');
  }
}