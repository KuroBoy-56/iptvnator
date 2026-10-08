import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { NfTitleSearchComponent } from './nf-title-search.component';

@Component({
    standalone: true,
    imports: [NfTitleSearchComponent],
    template: `<app-nf-title-search label="Netflix" [(value)]="q" />`,
})
class HostComponent {
    readonly q = signal('');
}

describe('NfTitleSearchComponent', () => {
    function setup(initial = '') {
        const fixture = TestBed.createComponent(HostComponent);
        fixture.componentInstance.q.set(initial);
        fixture.detectChanges();
        const el: HTMLElement = fixture.nativeElement;
        const button = () =>
            el.querySelector('.nf-psearch-btn') as HTMLButtonElement;
        const field = () =>
            el.querySelector('.nf-psearch-in') as HTMLInputElement | null;
        const type = (text: string) => {
            const input = field() as HTMLInputElement;
            input.value = text;
            input.dispatchEvent(new Event('input'));
            fixture.detectChanges();
        };
        return { fixture, button, field, type };
    }

    it('shows only the magnifier until it is pressed', () => {
        const { fixture, button, field } = setup();
        expect(field()).toBeNull();

        button().click();
        fixture.detectChanges();

        expect(field()).not.toBeNull();
        expect(field()?.placeholder).toBe('Buscar en Netflix…');
    });

    it('writes the typed text back to the bound filter and stays open when emptied', () => {
        const { fixture, button, field, type } = setup();
        button().click();
        fixture.detectChanges();

        type('stranger');
        expect(fixture.componentInstance.q()).toBe('stranger');

        type('');
        expect(field()).not.toBeNull();
    });

    it('opens with a preset value and clears it when closed', () => {
        const { fixture, button, field } = setup('loki');
        expect(field()?.value).toBe('loki');

        button().click();
        fixture.detectChanges();

        expect(field()).toBeNull();
        expect(fixture.componentInstance.q()).toBe('');
    });
});
