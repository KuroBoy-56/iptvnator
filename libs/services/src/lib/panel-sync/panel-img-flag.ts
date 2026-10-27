/** Image cache switch of the panel owner ("img" in progress.php ?v=2); see panel-img.ts. */
const IMG_FLAG = 'panel_img_cache';

/** progress.php ?v=2 says whether the owner keeps the image cache on (applies to the next posters). */
export function rememberPanelImg(body: unknown): void {
    const img = (body as { img?: unknown } | null)?.img;
    if (typeof img !== 'boolean') return;
    try {
        localStorage.setItem(IMG_FLAG, img ? '1' : '0');
    } catch {
        // without storage the cache stays on
    }
}

export function panelImgOn(): boolean {
    try {
        return localStorage.getItem(IMG_FLAG) !== '0';
    } catch {
        return true;
    }
}
