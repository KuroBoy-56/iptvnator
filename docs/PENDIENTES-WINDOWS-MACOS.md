# Pendientes de Windows y macOS (MPX Player de escritorio) — 3 de noviembre de 2026

Revisión de lo que tienen Windows (`master`) y macOS (`macos`) comparado con Roku, Vega OS 1.0.55, webOS 1.3.0,
Tizen 1.1.0, Android / Android TV y lo que el panel (`panelweb` `main`) ya ofrece. **Actualizado el 3 de noviembre:
los puntos 1, 2, 3, 4 y 6 ya están hechos (ver «Estado»); el 5 no se hace (decisión del dueño).**

## Estado

| Punto | Estado |
| --- | --- |
| 1. Lista negra completa | ✅ hecho (`isDeviceBlocked`, estado `blocked`, la revisión de 10 min cierra la sesión) |
| 2. Top 10 de la semana | ✅ hecho (`panel-week-top.ts`, Inicio, Películas y Series) |
| 3. Control parental con PIN | ✅ hecho (`ParentalControlService`, Ajustes › Control parental, `set_pin`) |
| 4. Canal del partido por la guía | ✅ hecho (`sports-epg.ts`, `SportsDataService`) |
| 5. Idiomas al panel | ❌ no se hace: Windows y Mac usan MPV / VLC, que leen las pistas solos |
| 6. Tema de prueba | ✅ hecho (`/review`; panel: `windows` y `macos` en `REVIEW_THEME_APPS`) |
| 7. Firma de Apple | solo faltan los secretos (instrucciones abajo) |

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

### 5. Idiomas compartidos con el panel (obligatorio, Windows y macOS)
MPV ya ve todas las pistas sin servidor, pero Windows y Mac también tienen que **dejarle al panel** los idiomas de cada
video (`api/tracks.php`, mismo formato que Roku / Vega / LG / Samsung / web) para que los demás equipos los vean al
instante, y **leer primero lo que el panel ya sabe** (≤ 2 s) para armar el menú de audio y subtítulos antes de que MPV
termine de abrir. Falta:
- al abrir una película o un episodio, preguntar `tracks.php` (GET con la dirección en base64) y, si el panel no lo
  tiene, mandarle (POST) las pistas que MPV / el reproductor encontraron: contenedor, audios y subtítulos con idioma,
  códec, nombre, predeterminado y forzado (solo MKV y MP4, como las demás apps);
- servicio en `libs/services/src/lib/panel-sync/` (token de `progress.php`, como la sincronización), llamado desde el
  reproductor integrado y desde MPV / VLC (`external-playback.service.ts`), y nada en la DEMO si el panel no lo permite;
- pruebas del formato (el mismo que validan `tools/probe.test.js` de las TV y el panel).
Panel: nada nuevo (`api/tracks.php` ya existe).

### 6. Tema de prueba del dueño (obligatorio, Windows y macOS)
Igual que Vega, Android, LG, Samsung e iOS: con **Omitir** y el «Tema de prueba» encendido en Pantalla Falsa, el
inicio de sesión queda sencillo (usuario, contraseña, Ingresar y Autodemo; sin DNS ni código del equipo); Autodemo o
una cuenta del tema (`login.php` acción `review_login`) abren una pantalla con Películas, Series y Ajustes (solo
«Cerrar sesión») con los videos de la carpeta player del panel, en un reproductor sencillo, sin sesión, progreso ni
caché; no registra nada en el panel ni vence. Falta:
- **panel**: agregar `windows` y `macos` a `REVIEW_THEME_APPS` (`includes/review_theme.php`) y revisar que la página de
  Pantalla Falsa los muestre; prueba en `tools/tenant_test/`;
- **app**: leer `features.review` (acción `features`), login sencillo y la pantalla nueva (ruta propia fuera del
  workspace, sin `AuthGuard` de línea) en `apps/web/src/app/panel-login/`; i18n en los 4 idiomas; pruebas.
Archivos del panel para subir cuando se haga: `includes/review_theme.php` (y lo que toque de Pantalla Falsa).

### 7. macOS: firma y notarización de Apple (la compilación ya está lista)
`.github/workflows/build-macos.yml` **ya usa los secretos de Apple si existen**: con el certificado firma con Apple
y, con las credenciales de notarización, también notariza (el Mac abre la app sin avisos). Sin ellos firma «ad hoc»
(la primera vez: clic derecho › Abrir). No hay que cambiar código; solo agregar los secretos.

**Instrucciones (una sola vez):**
1. Inscribirse en el **Apple Developer Program** (developer.apple.com/programs, 99 USD al año). El **Team ID** (10
   letras y números) sale en developer.apple.com › Account › Membership details.
2. Crear el certificado **Developer ID Application** (para repartir la app fuera de la Mac App Store): en un Mac,
   Xcode › Settings › Accounts › tu cuenta › Manage Certificates › **+** › *Developer ID Application*. (Sin Xcode:
   Acceso a Llaveros › Asistente de certificados › Solicitar un certificado a una autoridad, y subir esa solicitud en
   developer.apple.com › Certificates › **+** › Developer ID Application; descargarlo y abrirlo.)
3. Exportarlo: **Acceso a Llaveros** › Mis certificados › clic derecho en «Developer ID Application: …» ›
   Exportar › formato **.p12**, con una contraseña.
4. Pasarlo a texto: en Terminal `base64 -i certificado.p12 | pbcopy` (queda copiado).
5. Contraseña para la notarización: appleid.apple.com › Inicio de sesión y seguridad › **Contraseñas de apps** ›
   generar una (formato `abcd-efgh-ijkl-mnop`).
6. En GitHub, repositorio **iptvnator** › Settings › Secrets and variables › Actions › **New repository secret**,
   uno por uno:

| Secreto | Valor |
| --- | --- |
| `CSC_LINK` | el texto del paso 4 (el .p12 en base64) |
| `CSC_KEY_PASSWORD` | la contraseña del .p12 (paso 3) |
| `APPLE_ID` | el correo de tu cuenta de Apple Developer |
| `APPLE_APP_SPECIFIC_PASSWORD` | la contraseña de app del paso 5 |
| `APPLE_TEAM_ID` | el Team ID del paso 1 |

7. Compilar otra vez: Actions › **Build macOS app** › Run workflow (rama `macos`), o el siguiente cambio en `macos`. En el
   registro, el paso «Signing mode» dice **«Signed with the Apple certificate and notarized.»** (con solo los dos
   primeros secretos: firmada sin notarizar). El paso «Verify the app» comprueba la firma.

Notas: el .p12 y las contraseñas nunca van al repositorio, solo a los secretos. Para la **Mac App Store** (no para
repartir el .dmg) hace falta otro certificado (*Apple Distribution* / *Mac Installer Distribution*) y la app con
sandbox: es otro trabajo, se hace solo si se decide publicar ahí.

## Orden propuesto
1 → 2 → 4 → 3 → 5 → 6 (todos obligatorios en Windows y macOS); el 7 solo necesita los secretos. Cada punto: código en `master` con pruebas
(`pnpm nx test web`, lint), `[skip ci]` (Windows lo compilas tú), y merge en `macos` para que GitHub compile el Mac.
Panel: ningún archivo nuevo para los puntos 1, 2, 4 y 5 (ya existen); el 3 usa `set_pin` que ya existe; el 6 sí toca
el panel (`includes/review_theme.php`).
