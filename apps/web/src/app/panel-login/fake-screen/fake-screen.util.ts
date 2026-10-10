/** Fake screen sent by the panel's check_mac to new devices («Pantalla Falsa», owner only). */
export interface PanelFakeScreen {
    type: 'calculator' | 'carrusel' | 'image' | 'video' | 'web';
    url: string;
    images: string[];
    interval: number;
    unlock: string;
}

const TYPES: PanelFakeScreen['type'][] = ['calculator', 'carrusel', 'image', 'video', 'web'];
const isHttp = (u: unknown): u is string => typeof u === 'string' && /^https?:\/\//i.test(u);

/** check_mac reply -> fake screen, or null when the panel sends none (or show is false). */
export function parseFakeScreen(data: unknown): PanelFakeScreen | null {
    const f = (data as { fake_screen?: Record<string, unknown> } | null)?.fake_screen;
    if (!f || f['show'] !== true) return null;
    let type = (TYPES.includes(f['type'] as PanelFakeScreen['type']) ? f['type'] : 'calculator') as PanelFakeScreen['type'];
    const url = isHttp(f['url']) ? f['url'] : '';
    const images = Array.isArray(f['images']) ? f['images'].filter(isHttp) : [];
    if ((type === 'carrusel' && !images.length) || (type !== 'calculator' && type !== 'carrusel' && !url)) type = 'calculator';
    // the app's CSP only frames https pages (sandboxed iframe)
    if (type === 'web' && !/^https:\/\//i.test(url)) type = 'calculator';
    const interval = Math.min(120, Math.max(1, Number(f['interval']) || 5));
    return { type, url, images, interval, unlock: String(f['unlock'] ?? '').replace(/\D/g, '') };
}

/** + - × ÷ and parentheses, no eval. */
export function calculate(src: string): string {
    if (/[^\d.()+\-×÷\s]/.test(src)) return 'Error';
    const t = src.match(/\d+(\.\d+)?|[()+\-×÷]/g) ?? [];
    if (!t.length) return '';
    let p = 0;
    const num = (): number => {
        const x = t[p++];
        if (x === '(') {
            const v = add();
            p++;
            return v;
        }
        if (x === '-') return -num();
        if (x === undefined || Number.isNaN(Number(x))) throw new Error('n');
        return Number(x);
    };
    const mul = (): number => {
        let v = num();
        while (t[p] === '×' || t[p] === '÷') {
            const o = t[p++];
            const r = num();
            v = o === '×' ? v * r : v / r;
        }
        return v;
    };
    const add = (): number => {
        let v = mul();
        while (t[p] === '+' || t[p] === '-') {
            const o = t[p++];
            const r = mul();
            v = o === '+' ? v + r : v - r;
        }
        return v;
    };
    try {
        const v = add();
        return p === t.length && Number.isFinite(v) ? String(Math.round(v * 1e10) / 1e10) : 'Error';
    } catch {
        return 'Error';
    }
}
