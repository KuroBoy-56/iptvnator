import { installInputModality } from './input-modality';

function pointer(type: string, pointerType: string): Event {
    const event = new Event(type, { bubbles: true });
    Object.defineProperty(event, 'pointerType', { value: pointerType });
    return event;
}

describe('installInputModality', () => {
    let uninstall: () => void;

    afterEach(() => {
        uninstall?.();
        delete document.documentElement.dataset['input'];
    });

    it('starts from the primary pointer of the device', () => {
        uninstall = installInputModality(document, {
            matchMedia: () => ({ matches: true }) as MediaQueryList,
        });
        expect(document.documentElement.dataset['input']).toBe('touch');
    });

    it('follows the last input: touch, pen and mouse, without touching the click', () => {
        uninstall = installInputModality(document, {
            matchMedia: () => ({ matches: false }) as MediaQueryList,
        });
        expect(document.documentElement.dataset['input']).toBe('mouse');
        const click = jest.fn();
        document.body.addEventListener('click', click);

        document.body.dispatchEvent(pointer('pointerdown', 'touch'));
        expect(document.documentElement.dataset['input']).toBe('touch');
        // un pointermove de tipo touch (deslizar) no vuelve a mouse
        document.body.dispatchEvent(pointer('pointermove', 'touch'));
        expect(document.documentElement.dataset['input']).toBe('touch');

        document.body.dispatchEvent(pointer('pointerdown', 'pen'));
        expect(document.documentElement.dataset['input']).toBe('pen');

        document.body.dispatchEvent(pointer('pointermove', 'mouse'));
        expect(document.documentElement.dataset['input']).toBe('mouse');
        expect(click).not.toHaveBeenCalled();
        document.body.removeEventListener('click', click);
    });

    it('stops listening when uninstalled', () => {
        uninstall = installInputModality(document, {
            matchMedia: () => ({ matches: false }) as MediaQueryList,
        });
        uninstall();
        document.body.dispatchEvent(pointer('pointerdown', 'touch'));
        expect(document.documentElement.dataset['input']).toBe('mouse');
    });
});
