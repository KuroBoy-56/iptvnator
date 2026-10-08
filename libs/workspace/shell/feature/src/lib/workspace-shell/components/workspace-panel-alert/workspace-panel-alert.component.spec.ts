import { TestBed } from '@angular/core/testing';
import { WorkspacePanelAlertComponent } from './workspace-panel-alert.component';
import * as util from './panel-alert.util';

describe('WorkspacePanelAlertComponent', () => {
    afterEach(() => jest.restoreAllMocks());

    async function setup(alert: util.PanelAlert | null) {
        jest.spyOn(util, 'fetchPanelAlert').mockResolvedValue(alert);
        const fixture = TestBed.createComponent(WorkspacePanelAlertComponent);
        fixture.detectChanges();
        await fixture.whenStable();
        fixture.detectChanges();
        return { fixture, el: fixture.nativeElement as HTMLElement };
    }

    it('renders the panel text as text (no remote HTML) with the image for welcomes', async () => {
        const { el } = await setup({
            expiry: false,
            title: '★ ¡Bienvenido! ★',
            message: '<b>hola</b>',
            image: 'https://panel/img/alertas/a.jpg',
            button: 'ENTENDIDO',
        });
        expect(el.querySelector('.panel-alert__title')?.textContent).toContain('¡Bienvenido!');
        expect(el.querySelector('.panel-alert__message')?.textContent).toBe('<b>hola</b>');
        expect(el.querySelector('b')).toBeNull();
        expect(el.querySelector('img')?.getAttribute('src')).toBe('https://panel/img/alertas/a.jpg');
        expect(document.activeElement).toBe(el.querySelector('button'));
    });

    it('closes with the button and with Escape', async () => {
        const { fixture, el } = await setup({ expiry: true, title: 'E', message: 'm', image: '', button: 'ENTENDIDO' });
        expect(el.querySelector('.panel-alert.is-expiry')).not.toBeNull();
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
        fixture.detectChanges();
        expect(el.querySelector('.panel-alert')).toBeNull();

        fixture.componentInstance.alert.set({ expiry: false, title: 'W', message: '', image: '', button: 'OK' });
        fixture.detectChanges();
        (el.querySelector('button') as HTMLButtonElement).click();
        fixture.detectChanges();
        expect(el.querySelector('.panel-alert')).toBeNull();
    });

    it('renders nothing when the panel has no alert', async () => {
        const { el } = await setup(null);
        expect(el.querySelector('.panel-alert')).toBeNull();
    });
});
