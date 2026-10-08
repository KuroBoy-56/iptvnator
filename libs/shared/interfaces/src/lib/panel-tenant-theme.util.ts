import { PANEL_TENANT_KEYS, PanelTenantPalette } from './panel-tenant.util';

/** Distributor palette plus the colours the app derives from it. */
export interface PanelTenantTheme extends PanelTenantPalette {
    onAccent: string;
    textMuted: string;
    card: string;
}

const STYLE_ID = 'panel-tenant-theme';

function rgb(hex: string): [number, number, number] {
    const n = parseInt(hex.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function toHex([r, g, b]: number[]): string {
    return `#${[r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`.toUpperCase();
}

/** WCAG relative luminance (0 black … 1 white). */
export function relativeLuminance(hex: string): number {
    const [r, g, b] = rgb(hex).map((v) => {
        const c = v / 255;
        return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Black or white, whichever contrasts more with the accent. */
export function onAccentColor(accent: string): string {
    const l = relativeLuminance(accent);
    return (l + 0.05) / 0.05 > 1.05 / (l + 0.05) ? '#000000' : '#FFFFFF';
}

/** `a` mixed `weight` (0..1) toward `b`. */
export function mixHex(a: string, b: string, weight: number): string {
    const x = rgb(a);
    const y = rgb(b);
    return toHex(x.map((v, i) => v + (y[i] - v) * weight));
}

export function deriveTenantTheme(palette: PanelTenantPalette): PanelTenantTheme {
    const [r, g, b] = rgb(palette.text);
    return {
        ...palette,
        onAccent: onAccentColor(palette.accent),
        textMuted: `rgba(${r}, ${g}, ${b}, 0.65)`,
        card: mixHex(palette.surface, palette.text, 0.08),
    };
}

/**
 * CSS that repaints the Netflix look with the distributor colours. It targets
 * both :root and body.dark-theme because the Material dark theme redeclares
 * some tokens on the body.
 */
export function buildTenantThemeCss(palette: PanelTenantPalette | null): string {
    if (!palette) return '';
    const t = deriveTenantTheme(palette);
    const vars: Record<string, string> = {
        '--nf-red': t.accent,
        '--nf-red-h': mixHex(t.accent, '#FFFFFF', 0.12),
        '--nf-on-accent': t.onAccent,
        '--nf-bg': t.bg,
        '--nf-bg2': t.surface,
        '--nf-surface': t.surface,
        '--nf-card': t.card,
        '--nf-text': t.text,
        '--nf-gray2': t.textMuted,
        '--app-selection-color': t.accent,
        '--app-selection-on-color': t.onAccent,
        '--app-live-color': t.accent,
        '--app-provider-xtream': t.accent,
        '--app-content-bg': t.bg,
        '--mat-sys-surface': t.bg,
        '--mat-sys-surface-container-low': t.bg,
        '--mat-sys-surface-container': t.surface,
        '--mat-sys-surface-container-high': t.card,
        '--mat-sys-on-surface': t.text,
        '--mat-sys-on-surface-variant': t.textMuted,
        '--mat-sys-primary': t.accent,
        '--mat-sys-on-primary': t.onAccent,
        '--mat-dialog-container-color': t.surface,
        '--mat-menu-container-color': t.surface,
        '--mat-select-panel-background-color': t.surface,
        '--app-widget-bg': t.surface,
        '--app-card-hover-bg': t.card,
        '--app-heading-color': t.text,
        '--app-body-color': t.textMuted,
    };
    const body = Object.entries(vars)
        .map(([k, v]) => `${k}: ${v};`)
        .join(' ');
    return `html:root, html body.dark-theme { ${body} } html body #initial-splash { background: ${t.bg}; color: ${t.text}; }`;
}

/**
 * Applies (or removes, with null) the distributor palette and remembers the
 * CSS so assets/panel-branding-boot.js paints it before Angular starts.
 */
export function applyTenantTheme(palette: PanelTenantPalette | null, doc: Document = document): void {
    const css = buildTenantThemeCss(palette);
    let style = doc.getElementById(STYLE_ID) as HTMLStyleElement | null;
    if (!css) {
        style?.remove();
    } else {
        if (!style) {
            style = doc.createElement('style');
            style.id = STYLE_ID;
            doc.head.appendChild(style);
        }
        style.textContent = css;
    }
    try {
        if (css) localStorage.setItem(PANEL_TENANT_KEYS.themeCss, css);
        else localStorage.removeItem(PANEL_TENANT_KEYS.themeCss);
    } catch {
        // Storage unavailable: the colours apply once Angular starts.
    }
}
