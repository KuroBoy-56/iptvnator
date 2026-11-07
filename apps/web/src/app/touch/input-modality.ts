/**
 * Con qué se está usando MPX Player ahora: mouse, pantalla táctil o lápiz (Pointer Events de Chromium / Electron).
 * Se marca en <html data-input="mouse|touch|pen"> para que los estilos de _touch.scss adapten solo lo que hace falta
 * (por ejemplo, ocultar las flechas de las filas, que solo aparecen con el mouse encima y con el dedo tapaban el borde
 * de las tarjetas). No reemplaza ningún evento: clics, teclado y mouse siguen igual y un toque no genera dos acciones.
 * En un portátil táctil cambia sola: tocar la pantalla pasa a «touch» y mover el mouse vuelve a «mouse».
 */
export type InputModality = 'mouse' | 'touch' | 'pen';

export const INPUT_MODALITY_ATTR = 'input';

export function installInputModality(
    doc: Document = document,
    win: Pick<Window, 'matchMedia'> = window
): () => void {
    const root = doc.documentElement;
    const set = (modality: InputModality) => {
        if (root.dataset[INPUT_MODALITY_ATTR] !== modality) {
            root.dataset[INPUT_MODALITY_ATTR] = modality;
        }
    };
    // antes de tocar nada: lo que dice el equipo (pantalla táctil como entrada principal = touch)
    set(win.matchMedia?.('(pointer: coarse)').matches ? 'touch' : 'mouse');

    const onPointerDown = (event: PointerEvent) => {
        const type = event.pointerType;
        if (type === 'touch' || type === 'pen' || type === 'mouse') set(type);
    };
    // solo un mouse de verdad se mueve sin tocar (después de un toque no hay pointermove de tipo mouse)
    const onPointerMove = (event: PointerEvent) => {
        if (event.pointerType === 'mouse') set('mouse');
    };
    const options: AddEventListenerOptions = { capture: true, passive: true };
    doc.addEventListener('pointerdown', onPointerDown, options);
    doc.addEventListener('pointermove', onPointerMove, options);
    return () => {
        doc.removeEventListener('pointerdown', onPointerDown, options);
        doc.removeEventListener('pointermove', onPointerMove, options);
    };
}
