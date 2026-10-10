// Paints the cached distributor branding (colours, name) before Angular starts,
// so a distributor's app never flashes the built-in red theme. The CSS is the one
// applyTenantTheme() saved (libs/shared/interfaces panel-tenant-theme.util.ts).
// With "Omitir" or no distributor nothing is stored and nothing changes.
(function () {
    try {
        if (localStorage.getItem('panel_dist_choice') !== 'code') return;
        const css = localStorage.getItem('panel_dist_theme_css');
        if (css) {
            const style = document.createElement('style');
            style.id = 'panel-tenant-theme';
            style.textContent = css;
            document.head.appendChild(style);
        }
        const cache = JSON.parse(localStorage.getItem('panel_dist_cache') || 'null');
        const name = cache && typeof cache.name === 'string' ? cache.name : '';
        if (!name) return;
        document.title = name;
        document.addEventListener('DOMContentLoaded', function () {
            const splash = document.getElementById('initial-splash');
            const mark = splash && splash.querySelector('.splash-mark');
            if (mark) mark.textContent = name;
            if (splash) splash.setAttribute('aria-label', 'Cargando ' + name);
        });
    } catch (e) {
        // storage unavailable: built-in look
    }
})();
