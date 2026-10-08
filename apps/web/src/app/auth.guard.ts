import { Injectable, inject } from '@angular/core';
import { CanActivate, Router } from '@angular/router';
import { readTenantChoice } from '@iptvnator/shared/interfaces';
import { AuthService } from './auth.service';

@Injectable({
  providedIn: 'root'
})
export class AuthGuard implements CanActivate {
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);

  async canActivate(): Promise<boolean> {
    // Verificamos si la sesion sigue siendo valida
    // no distributor choice yet: the login shows the distributor step first
    const isValid = readTenantChoice() !== 'none' && (await this.authService.verifySessionActive());

    if (!isValid) {
      // Limpiar y botar a la pantalla de login
      this.authService.logout();
      this.router.navigate(['/login']);
      return false;
    }

    return true;
  }
}