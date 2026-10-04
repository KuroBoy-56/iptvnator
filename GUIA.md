# Guía para terminar: App Windows

1. **Unir los cambios:** en GitHub abre el PR "panel-unificado" y pulsa **Merge**.
2. **Instalar:** en tu PC con Windows instala Node.js 22 y pnpm (`npm i -g pnpm`), luego:
   ```
   git clone https://github.com/KuroBoy-56/iptvnator
   cd iptvnator
   pnpm install
   ```
3. **Llave** (PowerShell, en la misma ventana):
   ```
   $env:PANEL_MASTER_KEY="TU_LLAVE_DE_64_CARACTERES"
   node tools/panel/write-panel-key.mjs
   ```
   Esto crea `apps/electron-backend/src/assets/panel-key.json`, que no se sube a GitHub.
4. **Crear el instalador:**
   ```
   pnpm run make:app
   ```
   El instalador queda en la carpeta `dist/`.
5. **Prueba:**
   - Abre la app y revisa que salga el ID de Windows (`XX:XX:…`).
   - Actívalo desde el panel o prueba la Demo automática.
   - Reproduce algo con VLC o MPV y revisa que Seguir viendo lo recuerde.
