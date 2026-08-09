import { Injectable, inject } from '@angular/core';
import { CanActivate, Router } from '@angular/router';
import { AuthService } from './auth.service';

@Injectable({
  providedIn: 'root'
})
export class AuthGuard implements CanActivate {
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);

  async canActivate(): Promise<boolean> {
    // Verificamos si la sesion sigue siendo valida
    const isValid = await this.authService.verifySessionActive();

    if (!isValid) {
      // Limpiar y botar a la pantalla de login
      this.authService.logout();
      this.router.navigate(['/login']);
      return false;
    }

    return true;
  }
}