import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TranslateModule } from '@ngx-translate/core';
import { SettingsAboutSectionComponent } from './settings-about-section.component';

describe('SettingsAboutSectionComponent', () => {
    let fixture: ComponentFixture<SettingsAboutSectionComponent>;

    beforeEach(async () => {
        await TestBed.configureTestingModule({
            imports: [
                SettingsAboutSectionComponent,
                TranslateModule.forRoot(),
            ],
        }).compileComponents();

        fixture = TestBed.createComponent(SettingsAboutSectionComponent);
        fixture.componentRef.setInput('activeSection', 'about');
        fixture.componentRef.setInput('isDesktop', true);
        fixture.componentRef.setInput('version', '1.5.22');
        fixture.detectChanges();
    });

    it('shows the installed version', () => {
        expect(fixture.nativeElement.textContent).toContain('1.5.22');
    });

    it('has no built-in updater (no GitHub release checks or update buttons)', () => {
        const el = fixture.nativeElement as HTMLElement;

        expect(el.querySelector('[data-test-id^="app-update"]')).toBeNull();
        expect(el.innerHTML).not.toContain('/releases');
    });
});
