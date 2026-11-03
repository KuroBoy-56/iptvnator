import { Injectable, signal } from '@angular/core';
import { ReviewContent } from '../panel-login.service';

/**
 * Tema de prueba del dueño abierto (estilo IBO Player): los videos de Películas y Series que dio el panel
 * (review_login). Solo en memoria: sin sesión, progreso ni caché; al cerrar sesión o la app se pierde.
 */
@Injectable({ providedIn: 'root' })
export class ReviewThemeService {
    readonly content = signal<ReviewContent | null>(null);

    open(content: ReviewContent): void {
        this.content.set(content);
    }

    close(): void {
        this.content.set(null);
    }
}

/** La pantalla del tema solo con su contenido (si no, vuelve al inicio de sesión). */
export function reviewThemeGuard(service: ReviewThemeService): boolean {
    return service.content() !== null;
}
