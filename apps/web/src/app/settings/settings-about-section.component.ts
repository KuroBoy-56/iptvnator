import { Component, input, ViewEncapsulation } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { TranslateModule } from '@ngx-translate/core';

/**
 * Acerca de: versión instalada, créditos y avisos. Sin actualizador integrado (1.5.22): la versión de Microsoft Store se
 * actualiza desde la Store y la del EXE tendrá su propio actualizador; el de IPTVnator consultaba GitHub.
 */
@Component({
    selector: 'app-settings-about-section',
    imports: [MatButtonModule, MatIconModule, TranslateModule],
    templateUrl: './settings-about-section.component.html',
    encapsulation: ViewEncapsulation.None,
    styles: [':host { display: contents; }'],
})
export class SettingsAboutSectionComponent {
    readonly activeSection = input.required<string>();
    readonly isDesktop = input(false);
    readonly version = input<string | undefined>();
}
