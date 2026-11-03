# Pendientes de Windows y macOS (MPX Player de escritorio) — 3 de noviembre de 2026

Revisión de lo que tienen Windows (`master`) y macOS (`macos`) comparado con Roku, Vega OS 1.0.55, webOS 1.3.0,
Tizen 1.1.0, Android / Android TV y lo que el panel (`panelweb` `main`) ya ofrece. **Solo documentación: nada de
esto está hecho todavía; se ejecuta cuando el dueño lo ordene.**

`macos` está al día con `master` (0 commits de diferencia; la última compilación de macOS, run 19, salió bien). Todo
lo de abajo vale igual para los dos: se hace en `master` (sin compilar, `[skip ci]`) y se lleva a `macos` con un merge
(eso sí compila en GitHub).

## Lo que ya tienen

| Función | Estado | Dónde |
| --- | --- | --- |
| Login con el panel (`check_mac`, `fetch_dns`, `submit_url`, `auto_demo`) cifrado, con `ts` antirrepetición y reintento si el reloj está corrido | ✅ | `apps/electron-backend/src/app/panel/`, `panel-login.service.ts` |
| Id del equipo estable (MachineGuid en Windows, IOPlatformUUID en Mac) | ✅ | `panel/device-id.ts` |
| Pantalla falsa del panel | ✅ | `panel-login/fake-screen/` |
| Distribuidor (número, marca, colores, `features.platforms`, Cambiar distribuidor) | ✅ | `panel-tenant.service.ts` |
| Autodemo, código de revendedor de 6 caracteres, DEMO sin progreso ni Mi lista, `demo_expires` / `demo_duration` | ✅ | `panel-login.service.ts`, `panel-demo.util.ts` |
| Revisión cada 10 min (`poll: 1`) y fin exacto de la DEMO | ✅ | `panel-session-guard.service.ts` |
| Borrado de caché desde el panel (`cc` / `cache_clear`, espera si hay un video abierto) | ✅ | `cache-clear.util.ts`, `panel-cache-clear.ts` |
| Aviso del panel (Alertas) con varias imágenes cada 3 s | ✅ | `WorkspacePanelAlertComponent` |
| Progreso y Mi lista sincronizados (`progress.php`), EPG del panel de respaldo | ✅ | `libs/services/src/lib/panel-sync/` |
| Carátulas por la caché del panel (`imgc` → `img.php` → original → TMDB) | ✅ | `TmdbPosterDirective`, `panel-img.ts` |
| Deportes: agenda, canales que transmiten, Tablas, Selecciones, Equipos (hora del panel) | ✅ | `apps/web/src/app/sports/` |
| Botón DNS (Automático + DoH), http ↔ https recordado por servidor | ✅ | `smart-dns.service.ts`, `stream-scheme.util.ts` |
| 4 idiomas (es / en / pt / fr) y `lang` en los pedidos al panel | ✅ | `app-language.util.ts` |
| Reportes de error cifrados al panel | ✅ | `panel-report.service.ts` |
| Reproducción: el formato que el navegador no abre pasa a MPV integrado (lee todo y cambia audio / subtítulos solo); **el servidor del panel nunca hace falta** | ✅ | `playback-recovery.ts`, `embedded-mpv-native.service.ts` |
| Menú de idiomas solo con el idioma («Español latino», «Inglés 2») | ✅ | `track-language.util.ts` |
| Siguiente episodio estilo Netflix (cuenta de 15 s, «Ver ahora» / «Cancelar») | ✅ | `PortalInlinePlayerComponent` |
| Pantallas Netflix (Inicio, Series, Películas, TV en vivo, Deportes, Explorar, Mi lista, Continuar viendo) | ✅ | `libs/portal/xtream/feature/src/lib/nf/` |

**No aplican en escritorio** (no se hacen): controles para control remoto (en PC se usan ratón y teclado; los botones
de ±10 s del reproductor se quedan), vista previa del canal estilo Roku, conversión de audio / video en la VPS / VDS
(MPV integrado reproduce todo y cambia de idioma sin servidor).

## Lo que les falta

### 1. Lista negra completa (prioridad alta)
Hoy: si el equipo está bloqueado, el panel responde `403 {"code":"device_blocked"}` y la app muestra su texto al
abrir y al escribir usuario y contraseña (no entra). **Falta:**
- Con la app abierta, la revisión de cada 10 min solo cierra la sesión si el panel dice «sin línea» (`inactive`); un
  `device_blocked` cuenta como error de red y **la sesión sigue abierta**. Debe cerrar la sesión y volver al login con
  el aviso (como Vega 1.0.47).
- Reconocer `device_blocked` aparte (aviso fijo de equipo bloqueado en lugar del error genérico; Autodemo
  deshabilitada mientras esté bloqueado).
- Pruebas: `panel-login.service.spec.ts`, `panel-session-guard.service.spec.ts`.

### 2. Top 10 de la semana (prioridad alta)
Hoy «Top 10 de hoy» / «Top 10 películas / series» se arma con la calificación del catálogo (cambia poco). **Falta** usar
`api/top10.php` del panel como Roku, Vega, Android y LG: lo más popular de la semana en TMDB cruzado con el catálogo por
título y año (±1), y lo que falte con lo mejor calificado, distinto cada semana; guardado y pedido cada 12 h. Títulos
«Top 10 de la semana». Archivos: `nf-home.component.ts`, `nf-browse.component.ts`, un servicio nuevo en
`libs/services/src/lib/panel-sync/` (reusar `normalizeTitle` de `title-normalization.util.ts`), i18n `MPX.NF.*` en los 4
idiomas, pruebas del cruce.

### 3. Control parental con el PIN del panel (prioridad media)
Roku, Vega, Android y las TV ocultan siempre el contenido para adultos y lo desbloquean con el PIN del panel
(`check_mac` → `pin`; 0000 de fábrica) y lo cambian en Cuenta (`login.php` acción `set_pin`). Windows y Mac **no tienen
control parental**. Falta: filtro de categorías / títulos de adultos (mismas palabras que las apps), diálogo de PIN y
«Cambiar PIN» en el menú de perfil / Ajustes.

### 4. Deportes: canal del partido por la guía (prioridad media)
Vega y Roku le mandan al panel sus canales deportivos (`api/sports_epg.php`) y el panel responde qué canales tienen el
partido en su programación. Windows solo busca por el nombre de los canales que transmiten y por equipos. Falta pedir
`sports_epg.php` (hasta 600 canales) y usarlo primero en `findSportsChannelForEvent`.

### 5. Idiomas compartidos con el panel (prioridad baja, opcional)
MPV ya ve todas las pistas sin servidor, así que Windows no lo necesita para sí, pero puede **dejarle al panel** los
idiomas de cada video (`api/tracks.php`, mismo formato que Roku / Vega / LG / web) para que los demás equipos los vean
al instante. Falta: al abrir un video en MPV, mandar su lista de pistas si el panel no la tenía.

### 6. Tema de prueba del dueño (solo si se publica en Microsoft Store / Mac App Store)
El panel no lo ofrece para `windows` ni `macos` (`REVIEW_THEME_APPS` en `includes/review_theme.php`). Solo hace falta si
la app va a pasar por la revisión de una tienda; entonces: agregar las dos apps en el panel y la pantalla sencilla
(Películas / Series con los videos del panel) como en Vega.

### 7. macOS: firma de Apple (cuando haya cuenta de desarrollador)
Hoy el `.dmg` está firmado «ad hoc» (`pnpm run make:mac`): el Mac pide permiso la primera vez. Con una cuenta Apple
Developer se puede firmar y notarizar en GitHub con secretos (como los `TIZEN_*` de Samsung).

## Orden propuesto
1 → 2 → 4 → 3 → 5 (6 y 7 solo si hacen falta). Cada punto: código en `master` con pruebas
(`pnpm nx test web`, lint), `[skip ci]` (Windows lo compilas tú), y merge en `macos` para que GitHub compile el Mac.
Panel: ningún archivo nuevo para los puntos 1, 2, 4 y 5 (ya existen); el 3 usa `set_pin` que ya existe; el 6 sí toca
el panel.
