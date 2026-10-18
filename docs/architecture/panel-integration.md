# Panel Integration

The desktop app (product name "MPX Player"; formerly "LatMpx TV+") is tied to the operator's IPTV
panel. The panel is the source of truth for the line (login), watch progress,
favorites, fallback EPG and the sports agenda. There is no Firebase or other
third-party sync.

## Panel endpoint

The panel base URL is not stored in plain text. `libs/shared/interfaces/src/lib/panel-endpoint.util.ts`
holds it as a hex string (XOR + base64 + hex) and decodes it at runtime:

- `getPanelApiBase()` returns the `.../master/panel/api/` base.
- `panelEndpoint('progress.php')` builds one endpoint URL.

Every panel call goes through these helpers: `login.php` (Electron main),
`progress.php`, `epg.php`, `sports.php` and `alerta.php` (the welcome / expiry
notice, see "Panel alert" below). The Xtream "add playlist" dialog no longer asks the old
`player_pc_api.php` for the line's DNS: a typed server URL is used as is,
otherwise the current panel's `fetch_dns` list is probed with the line's
credentials and the first server that answers `active` wins
(`libs/playlist/import/feature/src/lib/xtream-code-import/panel-dns-servers.ts`).
No other panel host or path is hardcoded.

## Login (Electron)

Route `/login` (`apps/web/src/app/login.component.*`) works the same way as
the Android app:

1. **Device id.** `apps/electron-backend/src/app/panel/device-id.ts` reads the
   Windows `MachineGuid` with `reg query` (through `execFile`, with no shell).
   It falls back to `/etc/machine-id` on Linux and `IOPlatformUUID` on macOS.
   The raw id is SHA-256 hashed. The first 16-hex window that does not start
   with `00` is upper-cased and formatted as eight `XX:` pairs. The id is shown
   on the login screen and sent as `mac_address`.
2. **Encrypted requests.** `panel-crypto.ts` builds
   `data = base64(salt16 + iv12 + AES-256-GCM ciphertext + tag16)`. The key
   comes from the panel's HKDF:
   - `prk = HMAC-SHA256(salt, masterKey)`
   - `okm = HMAC-SHA256(prk, 0x01)[0..32]`

   `panel-login.service.ts` posts the form fields `action` + `data` to
   `login.php`. Crypto runs only in the main process, behind the
   `PANEL_LOGIN_REQUEST` IPC handler.
3. **Actions.**
   - `check_mac`: the device already has a line, so the app logs in
     automatically.
   - `fetch_dns`: the server list.
   - `submit_url`: activates user and password on a DNS (picked
     automatically, see "Line server on login" below).
   - `auto_demo`: the response decides what happens:

     | Response | Behavior |
     | --- | --- |
     | 200 | Logs in with the demo user on the demo's own server (`url` of the reply; the session tries http and https on it). Older panels without `url`: `check_mac`, then the first DNS. |
     | 503 | The panel could not confirm the demo line with the IPTV server; nothing was registered. Shows the message. |
     | 403 | Shows the message. The button stays enabled: the panel decides on every try, so a demo the owner deleted can be asked for again. |
     | 404 | Unknown reseller code or no demo configured: shows the panel message, the demo stays available. |
     | 429 / 400 | Shows the message. |

     A reseller demo code typed in **Contraseña** (6 letters and digits with at
     least one letter, `isResellerCode`) goes upper-cased as `reseller`, so the
     demo is registered under that reseller. Digits only are never sent (that
     is a distributor number).
   - `check_mac` and `auto_demo` send `"enc": 1`: the panel answers the line
     (username + password) AES-GCM encrypted like `fetch_dns`, and the main
     process decrypts it. An older panel answers JSON and keeps working;
     errors are always JSON.
4. **Session.** `apps/web/src/app/panel-login/panel-session.service.ts` turns
   the line into the app session:
   - It creates or updates one Xtream playlist, named "MPX Player" or "DEMO".
   - It removes lines the panel no longer assigns to the device.
   - It sets the non-secret `session_*` keys (token marker, date, user, server) that `AuthGuard` reads.
   - The line password and the alert accounts stay in memory only
     (`session-credentials.util.ts` in `@iptvnator/shared/interfaces`), never in
     `localStorage`. The login screen sets them again on every start.

### Panel master key (`PANEL_MASTER_KEY`)

The AES master key is **never committed**, not even obfuscated. Provide it in
one of these ways:

- **Development:** export `PANEL_MASTER_KEY=<64 hex chars>` before
  `pnpm run serve:backend`.
- **Builds:** run `PANEL_MASTER_KEY=... node tools/panel/write-panel-key.mjs`
  before `nx build electron-backend`. The script writes
  `apps/electron-backend/src/assets/panel-key.json`, which is git-ignored and
  copied into the build output. CI does this in
  `.github/workflows/build-and-make.yaml` from the `PANEL_MASTER_KEY` secret.

Without a key, the app still builds and runs. The login screen shows a clear
"panel key missing" error instead of contacting the panel.

The PWA has no login crypto. It keeps working with an existing session and
degrades gracefully.

### Line check on start

`check_mac` runs on every start. When it returns a line, the login screen first
checks it on the IPTV server (`PortalStatusService.checkPortalStatus`): an
expired or rejected line clears the session and stays on the login screen with
the reason. An unreachable server does not block the entry (the scheme is
resolved later). The line password is never stored in `localStorage`.

While the app runs, `PanelSessionGuardService`
(`apps/web/src/app/panel-login/panel-session-guard.service.ts`, started by the
login's `enter()`) keeps the session tied to the panel: a demo ends at its exact
`demo_expires`, and every 10 minutes `check_mac` is asked again; when the panel
says the device has no line (deleted, expired demo) the lines are removed and the
app goes back to `/login`. A panel that does not answer changes nothing.

### Platform, fake screen and error reports

- **Platform.** Every `login.php` payload and the `progress.php` `auth` body
  carry `platform`: `windows`, or `macos` on a Mac (`panelAppId()` in
  `panel-tenant.util.ts`, read from `process.platform` / `navigator`). The
  panel stores it in the line's "Dispositivo" column (Clientes MAC) and uses it
  for the dashboard statistics.
- **Fake screen.** When `platform` is sent, an unregistered device's
  `check_mac` reply carries `fake_screen` (panel page «Pantalla Falsa»: per app,
  only new devices). `parseFakeScreen` (`apps/web/src/app/panel-login/fake-screen/`)
  keeps only http(s) URLs and falls back to the calculator. `FakeScreenComponent`
  shows a working calculator (no `eval`), a carousel, an image, a looping
  video, or an https page in a sandboxed iframe (`frame-src https:` in
  `index.html`; no same-origin, no popups, no top navigation). The panel code
  followed by `=` opens the login and is remembered as `panel_fake_unlocked`;
  the login re-checks the device every 30 s, so a device registered meanwhile
  enters on its own.
- **Error reports.** `panel-report.service.ts` sends `{app, version, kind,
  message, detail, screen, device, model, os, user, server, tenant}` to
  `api/report.php`, encrypted with the same AES-GCM envelope as `login.php`
  (IPC `PANEL_REPORT_ERROR`). The same message goes at most once a minute. The
  main process reports `uncaughtExceptionMonitor` and `unhandledRejection`; the
  renderer's `PanelErrorHandler` (`apps/web/src/app/services/panel-error-reporter.ts`)
  reports Angular errors. The line password is never part of a report. The
  owner sees them on the panel page «Errores de las apps».
  While that first `check_mac` runs the login renders only a dark spinner
  (`.nf-login-checking`), never the form: an active fake screen is the first
  thing the user sees.
- **Login poster wall:** `LoginPostersService` asks the panel
  `api/tmdb.php?path=movie/now_playing&language=<es-MX|en-US|pt-BR|fr-FR>&page=N&lang=<es|en|pt|fr>`
  (+ `t`/`app` with a distributor), in the app language (see "App language"). The panel uses the distributor's TMDB key or, with
  Omitir, the owner's; `{"error":"tmdb_key_not_set"}` means no wall. Cached
  12 h per distributor (`login_posters_v2` + `tenantStorageSuffix()`).

## TLS certificates

`apps/electron-backend/src/app/util/tls-policy.ts` decides which hosts must
present a valid certificate: the panel host (decoded from the built-in panel
URL) and the public APIs (TMDB, DoH resolvers, GitHub, YouTube, Google APIs).
Chromium (`setCertificateVerifyProc`, `certificate-error`) rejects an invalid
certificate for those hosts; IPTV provider servers, which are often
self-signed or expired, keep being accepted. The `ignore-certificate-errors`
switch is gone. `NODE_TLS_REJECT_UNAUTHORIZED=0` stays because the main
process only uses Node HTTP for provider servers; the panel goes through
`net.fetch`.

## Distributor (multi-tenant)

Each panel user is a **distributor** with a 6-digit number, its own DNS list,
lines, alerts, TMDB key, sports, name, logo and colours. The panel contract
(api/login.php `tenant_config`, error codes) is in the panel README,
"Distribuidores". App id: `windows` (`PANEL_APP_ID`).

- **Choice kept on the PC:** the choice lives in the Electron user data
  (`%APPDATA%`), so it survives updates. The NSIS uninstaller deletes that
  data (`deleteAppDataOnUninstall`), so uninstall + install starts again at
  the distributor step. After "Omitir" the login shows a link
  "¿Tienes un número de distribuidor?" that goes back to the step
  (`PanelTenantService.change()`).
- **First launch:** `/login` shows the "Número de distribuidor" step
  (6 digits, Continuar / Omitir) before the device check. `AuthGuard` also
  sends the user to `/login` while no choice is stored.
- **Omitir:** stores `panel_dist_choice=skip`; every request is exactly the
  old one (no `tenant`/`app` field, no `?t=`), built-in brand and colours.
  Never asked again.
- **Continuar:** `PanelTenantService.submit()` calls `tenant_config`
  (`PanelLoginService.tenantConfig()` → Electron main process, data
  `{code, app, device}`, encrypted answer decrypted like `fetch_dns`). On
  success the code and the branding cache (`PanelTenantCache`:
  name, logo, palette, expiry, features, rev, `recheckAfter`, `lastOkCheck`)
  go to `localStorage` (`panel_dist_choice`, `panel_dist_code`,
  `panel_dist_cache`). A build without the master key answers "Esta versión de
  la app no tiene la llave del panel"; Omitir still works.
- **Guardian** (`apps/web/src/app/panel-login/panel-tenant.service.ts`,
  started by `provideAppInitializer`): re-checks `tenant_config` at launch, on
  window focus / visibility and every `recheck_after` seconds (polled every
  10 min). `tenant_invalid` / `tenant_expired` / `tenant_suspended` /
  `app_not_linked` (or a local `now > expires_at`) wipe the code, the branding,
  the session and the per-distributor tokens, and show the step with the
  Spanish message ("Tu distribuidor venció el DD/MM/AAAA (hora de Panamá)").
  Network / 5xx keeps the cache for 72 h after the last ok check, then the
  login shows a "Reintentar" screen. The same fatal codes answered by any
  login action, `progress.php`, `epg.php` or `sports.php` reach the guardian
  through the `panel-tenant-error` window event.
- **Every panel call carries the tenant:** login actions add
  `tenant` + `app` in the encrypted payload (`PanelLoginPayload.tenant`,
  added by the renderer from storage; also `panelDnsServers()`), the
  `progress.php` auth body adds `tenant` + `app` (the token then carries them
  for `epg.php` / `sports.php`), `alerta.php` gets `&t=<code>&app=windows` (`macos` on a Mac)
  (`withTenantQuery`). Tokens and the panel TMDB key are stored per code
  (`tenantStorageSuffix()` = `@t<code>`) so two distributors never share one.
  The panel only ever hands a distributor its own TMDB key and its own
  TheSportsDB key/disciplines (never the owner's); an empty `tmdbKey` in a
  `progress.php` reply removes the stored key (`rememberPanelTmdbKey`).
- **Features:** `demo=false` hides Auto-Demo, `alerts=false` skips the panel
  alert, `sports=false` hides "Deportes" and guards `/workspace/sports`,
  `platforms=false` (default true; caches without it count as true) hides the
  platform tiles and "Lo mejor de …" rows on Inicio and makes Explorar ignore
  `?platform=` (`PanelBrandingService.platforms()`); genre filters stay.
  `features.ffmpeg` (panel audio/subtitle engine) is not read: this app never
  calls the engine, it plays directly or through MPV/VLC/embedded MPV.
- **Brand mark and focus:** the billboard kicker shows the first letter of the
  distributor name (no name or Omitir: "M" of MPX Player) instead of the
  Netflix "N", in `--nf-red` (the distributor accent). Keyboard focus on cards,
  platform tiles and the Explorar inputs uses `--nf-focus`: white by default,
  the accent with a palette (lifted 40 % toward white when the accent is
  nearly black, so it still shows on the dark background).
- **Branding:** `PanelBrandingService` (`libs/services/src/lib/panel-sync/`)
  exposes name / logo / features / expiry signals for the login, the top bar
  and Settings, sets the window title and calls `applyTenantTheme()`
  (`libs/shared/interfaces/src/lib/panel-tenant-theme.util.ts`). That injects
  `<style id="panel-tenant-theme">` redefining the `--nf-*` tokens of
  `_netflix.scss` and the Material/app tokens (accent, `--nf-on-accent` black
  or white by WCAG luminance, `--nf-gray2` = text at 65 %, `--nf-card` =
  surface mixed 8 % toward text). The CSS is cached so
  `assets/panel-branding-boot.js` paints it (and the splash name) before
  Angular starts. A null name / logo / palette keeps the built-in value; a logo
  that fails to load falls back to the text brand.
- **Settings > Distribuidor** (`settings-distributor-section.component.ts`):
  "Distribuidor: <name> (<code>)", "Vence: DD/MM/AAAA (hora de Panamá)" and
  "Cambiar distribuidor" (forget it, log out, back to the step; with Omitir it
  lets the user enter a code).

## DNS button

The login screen and Settings show a DNS button
(`apps/web/src/app/panel-login/secure-dns-picker.component.ts`, IPC
`SECURE_DNS_GET` / `SECURE_DNS_SET`, saved as `SECURE_DNS_MODE`), as in the
Android, iOS and TV apps: **Automático** (default) or a fixed DNS-over-HTTPS
provider (Cloudflare, Google, Quad9, AdGuard, NextDNS, OpenDNS). A provider is
used for every Chromium request (renderer, built-in players, panel login,
main-process line requests) with no automatic switching; external MPV/VLC keep
the OS resolver. There is no server selector. **Automático** is handled by
`apps/electron-backend/src/app/services/smart-dns.service.ts`, wired up in
`PanelEvents.bootstrapPanelEvents()`:

- **Routes.** `system` (Chromium `secureDnsMode: 'automatic'`, the OS
  resolver), then DNS-over-HTTPS `cloudflare`
  (`https://cloudflare-dns.com/dns-query`) and `google`
  (`https://dns.google/dns-query`), applied with `app.configureHostResolver`
  (`secureDnsMode: 'secure'`) plus `session.clearHostResolverCache()`.
- **Fallback.** `withDnsFallback(task)` runs a request on the active route. If
  it fails with a DNS-type error it switches to the next route, retries, and
  keeps the first one that works. `services/dns-failure.ts` decides what
  counts: resolution failures (`ENOTFOUND`, `EAI_AGAIN`, `ESERVFAIL`,
  `ETIMEOUT`, `net::ERR_NAME_NOT_RESOLVED`, `net::ERR_DNS_*`, ...) and
  connections refused/reset right away (`ECONNREFUSED`, `ECONNRESET`,
  `net::ERR_CONNECTION_REFUSED/RESET/CLOSED`), which is how many ISP
  resolvers block a host. Responses with an HTTP status and errors such as
  `ERR_INTERNET_DISCONNECTED` never switch routes. Switches are serialized, so
  parallel failures share one switch. When no route works, the original route
  is restored and the first error is returned.
- **What uses it.**
  - Panel login (`PANEL_LOGIN_REQUEST`): `net.fetch` is wrapped in
    `withDnsFallback`.
  - Line/portal requests made by the main process with axios (Xtream, Stalker,
    M3U downloads through `requestWithValidatedRedirects`): `url-safety.ts`
    resolves hosts through `setDefaultHostnameResolver(resolveHostnameSmart)`.
    On the `system` route Node's `dns.lookup` runs first; a DNS failure there,
    or a DoH route already in use, resolves through
    `session.defaultSession.resolveHost` with the same fallback. The
    validated addresses are pinned for the socket as before. Worker threads
    (EPG parser, playlist refresh) keep the OS resolver.
  - Everything else on Chromium's network stack (renderer requests to
    `progress.php`/`epg.php`/`sports.php`, the built-in player) follows the
    active route.
- **Memory.** The route that worked is stored in the Electron store
  (`DNS_ROUTE`) and applied again on the next start. The old manual choice
  (`SECURE_DNS_MODE`) is deleted on startup and never applied. There is no
  DNS IPC channel or bridge method any more (`PanelBridgeApi` only has
  `panelGetDeviceId` and `panelLoginRequest`).

**Limitation:** external MPV/VLC processes use the operating system resolver,
so the DoH fallback does not apply to them.

### Line server on login

The login screen has no "Servidor" selector either. When the user signs in,
`pickLineServer` (`apps/web/src/app/panel-login/line-server.util.ts`) probes
every `fetch_dns` server in parallel with the typed user and password
(`PortalStatusService.checkPortalStatus`). The first server that answers
`active` is used for `submit_url`; otherwise an `expired` one, otherwise the
first server. A single server is used without probing, and probing stops
after 12 s. Auto-Demo still uses the first server.

## Anti-replay `ts`

Every encrypted `login.php` payload built in the main process
(`apps/electron-backend/src/app/panel/panel-login.service.ts`) carries `ts`
(unix seconds). The panel accepts it within ±10 minutes and only once
(`includes/replay_guard.php`). When the device clock is off the panel answers
401 with `code` `ts_expired` / `ts_invalid` and `server_time`; the request is
encrypted again once with the clock corrected (the difference is kept for the
rest of the run).

## Demo lines (DEMO mode)

A line is a demo when it comes from the **Auto-Demo** button, when
`check_mac` answers `"demo": true`, or when `api/progress.php` answers
`"demo": true` (auth or `?v=2`; the panel says so when every panel record of
the user is a demo). `setSessionDemo()` / `isSessionDemo()`
(`libs/shared/interfaces/src/lib/panel-demo.util.ts`, key `session_demo`,
also mirrored to `is_demo_<playlistId>`) hold the flag; a normal login clears
it. While it is on:

- the line's user is never shown: the top bar menu and "Mi cuenta" say
  **DEMO**, and the password is never shown;
- the account dialog shows only what the panel says about the demo: its end
  (`demo_expires` from `check_mac` / `auto_demo`, unix seconds, shown with the
  exact local time) and its length (`demo_duration`: "DEMO · 2 horas"); the
  demo line's server, connections, creation and provider expiry are hidden.
  `setSessionDemoTimes()` stores them (`session_demo_expires`,
  `session_demo_duration`), `demoEndText()` / `demoLengthText()` format them,
  and turning the demo off clears them. No text says "24 horas": the length
  always comes from the panel;
- `PanelSyncService` sends no `save`, `delete`, `fav_add` or `fav_remove` and
  reads empty "Continuar viendo" / "Mi lista"; local playback positions are not
  saved either;
- adding to Mi lista shows "No disponible en la DEMO" (`blockedForDemo()`
  fires `PANEL_DEMO_BLOCKED_EVENT`, `AppComponent` shows the snack bar).

The panel enforces the same rule: it stores nothing for a demo line.

## Progress and favorites sync

`libs/services/src/lib/panel-sync/` talks to `api/progress.php`.

### Authentication

`PanelProgressClient` authenticates once with the Xtream user and password
(`action: auth`, plus the line's `dns`) and keeps only the returned token, in
`localStorage` under `panel_sync_token2:<lineKey>`. `lineKey` is
`user@host[:port]`: lowercase, with no scheme and no trailing slash, so the same
line over http or https shares one token, snapshot and favorites outbox. On a
401 it re-authenticates once.

### Reads and writes

- Reads use `GET ?v=2`, which returns `{progress, favorites}`. The snapshot is
  cached for 15 s and concurrent reads share one request.
- Writes use the actions `save`, `delete`, `fav_add` and `fav_remove`.

### Entry conventions

These are shared with the web player:

- **Movies:** keyed by movie name, as `{type: 'movie', id: stream_id, url,
  poster, categoryId, position, duration}`.
- **Series:** one entry per series, keyed by series name, as
  `{type: 'episode', id: episodeId, seriesId, poster: series cover}`. The
  series name comes from the provider's `get_series_info` when the player does
  not know it.
- At 95% watched or more, the entry is deleted.
- **Favorites:** `fav_add item {id, type: movie|series|live, title, poster,
  categoryId}`. `id` is the provider stream/series id (never the local DB row
  id). The heart/"Mi lista" toggle in the Xtream store (`withFavorites`) calls
  `FavoritesService.syncPanelFavorite` after the local write. When the item is
  not in the local cache yet (opened from search or a home rail), the toggle is
  saved on the panel only and the cache sync adds the local row later.
- **Favorites outbox** (`panel-favorites-outbox.ts`, `localStorage.panel_fav_outbox`):
  every `fav_add`/`fav_remove` is recorded before it is sent. A failed request
  stays queued and `PanelSyncService.flushFavorites` resends it on the next
  cache sync, even after a restart. For 2 minutes after a change (and while it
  is unsent) `getAllFavorites`/`isFavorite` apply it on top of the panel
  snapshot, so a snapshot that predates the change cannot undo it.
- Panel favorite types are read whatever their spelling (`movie`/`vod`/`movies`,
  `series`/`serie`, `live`/`channel`). See `favoriteBucket` and
  `toFavoritesTree` in `panel-sync.mapper.ts`.
- **Order (newest first, like the web player):** progress and favorites are
  sorted by the panel's `ts` (epoch seconds with microseconds; ms and µs
  integers are accepted too), then by `updatedAt` / `addedAt` (ISO or
  `Y-m-d H:i:s`), then by the order the panel returned the rows in. Every leaf
  of `toProgressTree` / `toFavoritesTree` carries `timestamp` (fractional
  seconds) and `rank`; sort with `panelNewestFirst`. `ts` used to be ignored
  for progress and the timestamps were floored to whole seconds, so
  "Continuar viendo" fell back to id order whenever `updatedAt` was missing
  or several items shared a second. Local saves (`save`, `fav_add`) stamp `ts`
  on the cached snapshot so the item jumps to the front right away.
- **"Mi lista" page** (`favorites` routes, `UnifiedFavoritesDataService`):
  `panelFavoritesToItems` (`libs/portal/shared/data-access/src/lib/collection/panel-favorite-items.ts`)
  matches each panel favorite with the line's catalog
  (`XTREAM_DATA_SOURCE.getContentByXtreamId`). The item then carries the local
  row id as `contentId` (open, play, remove), the real title, the cover and the
  category. Only items missing from the catalog fall back to the panel's
  title and poster, then to provider enrichment. Before this, `contentId` was
  the provider id and items showed as "Película 123" with no cover.
- `withFavorites.checkFavoriteStatus` asks the panel (`FavoritesService.panelStatus`)
  and repairs the local row when they disagree, so a favorite added on the web
  player or Android shows as such on Windows right away.
- **TMDB key:** `auth` and `GET ?v=2` also return `tmdbKey` (the key set in the
  panel settings). It is kept in `localStorage.panel_tmdb_key`;
  `TmdbRuntimeService` uses it when the user has no key of their own and then
  always enables TMDB. `TmdbPosterDirective` (`img[appTmdbPoster]`) uses it to
  replace missing or broken covers in grids, cards and dashboard rails. The
  detail hero (`ContentHeroComponent`, `mediaType` input passed by
  `PortalDetailShellComponent`) uses it the same way. On a first start, covers
  drawn before the key arrives wait for the `panel-tmdb-key` window event
  (`TmdbPosterService.whenKeyAvailable`).

### Player integration

`PanelSyncService.saveProgress` throttles saves to one per item every 20 s. A
forced save (player closed) or a watched item bypasses the throttle.

- **Resume:** `PlaybackPositionService` and `PlayerService.resolveStartTime`
  read the position from the panel first.
- **MPV/VLC:** `apps/web/src/app/services/external-playback.service.ts` saves
  the `MPV_PROGRESS_UPDATE` reports periodically and on close.

### Local cache

**"No local storage of record":** SQLite and IndexedDB rows are only a cache.
`apps/web/src/app/services/panel-cache-sync.service.ts` rebuilds local
positions and favorites from the panel every 60 s in Electron:

- It adds and updates entries that exist on the panel.
- It drops local entries that are missing on the panel.
- It first resends queued favorite changes, and skips the run entirely when the
  panel cannot be read (an unreadable panel used to look like an empty list and
  wiped the local favorites).

## Fallback EPG

The provider EPG comes first (`get_short_epg`, then the XMLTV fallback). For
channels still without a guide, `XtreamPanelEpgFallbackService`
(`libs/portal/xtream/data-access/src/lib/services/xtream-panel-epg-fallback.service.ts`)
batches requests to `api/epg.php`:

- Body: `{channels: [{id, epg, name}]}`, at most 400 per request
  (`PANEL_EPG_BATCH_SIZE`).
- Flush: every 250 ms.
- Cache: 10 minutes.

Stalker and M3U do not use the panel fallback yet.

## Panel alert (welcome / expiry)

The panel's **Alertas** page (`admin_alertas.php`) configures one general text
with an optional image (`img/alertas/`) and one text each for 3, 2, 1 and 0
days left. `WorkspacePanelAlertComponent`
(`libs/workspace/shell/feature/src/lib/workspace-shell/components/workspace-panel-alert/`)
is mounted by the workspace shell and, once per app start (shell creation,
so also after a new login), calls
`alerta.php?format=json&user&pass&dns&title&lang` for each in-memory alert
account (`getSessionAlertAccounts()`, title = playlist name):

- `type: "expiry"` (3/2/1 days, or 0 / expired): red title, no image. The
  first expiry among the lines wins.
- `type: "welcome"` (more than 3 days, no expiry date, or provider down):
  general text plus the image, resolved as panel root + `image_path`.

The notice is rendered natively from the JSON (text only, `white-space:
pre-line`), not by loading the panel's HTML card: an `srcdoc` iframe with
`allow-scripts allow-same-origin` would have run remote markup with the app's
origin. The button (the panel's text, else "Entendido" in the app language),
Esc or Enter close it. Failures show nothing.

## Sports

Route `/workspace/sports` (`apps/web/src/app/sports/`) is the "Deportes" link
of the top bar. It mirrors the web player's sports page:

- Day tabs: Hoy / Mañana.
- Sport chips with emoji and counts.
- A search box.
- League and team badges.
- Live / final / time / postponed states.
- An "En vivo ahora" row and a live count.

### Data

`PanelSyncService.fetchSportsAgenda()` reads `api/sports.php`, which returns
`{events, sports, match}`.

### "TV en vivo"

The button runs `findSportsChannel` (`libs/services/src/lib/panel-sync/sports-matcher.ts`).
It applies the panel's `match` rules to the line's live streams and categories:

- Stop words and aliases.
- The event-category regex.
- The scoring weights.

The live streams and categories are fetched through `providerApiGet`, which
uses the Electron Xtream bridge.

The best channel opens in the Xtream live view, through the
`openXtreamLiveItemId` history state. When there is no exact match, the first
event category opens instead.

### Broadcast channels

Events may carry `tv: [{n, c}]` (channel name and country, region first), which
the panel takes from TheSportsDB (`includes/sports_tv.php`). The card shows
"En TV: …" and its button becomes **Ver canales**: a menu with **Ver el evento**
(`findSportsChannelForEvent`: the first broadcast channel the client has, then the
teams), one row per channel (`findChannelByName`) and **Buscar por equipos**
(`findSportsChannel`). `channelKey` drops quality and country tags and glues a
number to the word before it, so "ESPN 2" finds "MX: ESPN 2 HD" and never "ESPN"
or "ESPN 3". A channel the client lacks falls back to the team / event-name match
with a toast. Android, Vega, Roku and the web player use the same rules.

## Netflix look

The app uses the same design as the web player (`assets/nf/app.css`,
`homex.php`, `includes/ondemand.php`, `browse.php`) and the TV app.

### Top bar

`WorkspaceNfHeaderComponent`
(`libs/workspace/shell/feature/src/lib/workspace-shell/components/workspace-nf-header/`)
replaces the old rail and toolbar.

- Links: Inicio, Series, Películas, TV en vivo, Deportes, Explorar. They point
  to the open Xtream line, or to the first one.
- Search opens Explorar filtered by title (`explore?q=`), like the web player.
  Ctrl/Cmd+F focuses it.
- Clock (in the app language) and a profile menu: Mi cuenta, Actualizar
  contenido, Descargas, Idioma de la app (see "App language"), Ajustes.
  Mi cuenta (`AccountInfoComponent`) shows "Canales en vivo", "Películas" and
  "Series" of the loaded catalog; the counts follow the store and read "…"
  while that type is still loading.
- The bar is a window drag region in the frameless Windows/Linux build. It is
  transparent over a billboard and turns solid on scroll or on other pages.

The category sidebar now only shows for live TV (plus Settings and Sources).

### Pages

They live in `libs/portal/xtream/feature/src/lib/nf/`.

- `home` (Inicio), `NfHomeComponent`:
  - billboard and platform tiles;
  - Continuar viendo and Mi lista, read from the panel (`NfLibraryService`),
    newest first; their "Ver todo" opens `continue-watching` / `my-list`
    (`NfLibraryPageComponent`), the full list as a poster grid in the same order;
  - Top 10 de hoy, Películas agregadas recientemente, Series nuevas;
  - "Lo mejor de …" platform rows, Series para ti, genre rows, Películas para ti.
- `vod` and `series` roots, `NfBrowseComponent`: billboard, Categorías select,
  genre chips, Agregadas recientemente, Top 10, and one row per provider
  category, rendered progressively.
- `explore`, `NfExploreComponent`: the poster grid behind every "Ver todo",
  platform tile, genre chip and search. Its query params are `type`,
  `platform`, `genre`, `category`, `sort` and `q`. On a platform page the
  inline title filter is replaced by a top-right magnifier
  (`NfTitleSearchComponent`) that expands a field filtering the grid by
  name as you type (case- and accent-insensitive, like `browse.php`).

Shared pieces:

- The billboard (`NfHeroService`) uses provider backdrops. When a title has
  none, it falls back to the TMDB backdrop (`TmdbPosterService.findBackdrop`).
  The last backdrop shown (`NfHeroService.lastBackdrop`) stays behind the next
  billboard while it loads, and faded behind the Explorar header (platforms,
  genres, categories), so moving between pages never shows a black banner.
- Platforms and genres match category names with the web player's keyword
  tables (`nf-filters.ts`).
- Cards open the existing detail pages. Playback, resume and favorites are
  unchanged.

The `.nf-*` styles are global in `apps/web/src/_netflix.scss`. Platform images
are in `apps/web/src/assets/images/platforms/`.

The workspace entry (`/workspace`) and the dashboard redirect go to the first
Xtream line's `home`.

### Theme

The app is dark only. `SettingsService.changeTheme` always applies
`dark-theme`, whatever theme an older version saved, and `index.html` starts
with it. The Settings theme picker was removed. The workspace shell paints
`#141414` with off-white text, so a light Material theme used to give white
surfaces with white text in live TV, Settings, detail pages and dialogs
(Mi cuenta). `m3-theme.scss` also sets neutral `#181818` dialog, menu, select
and card container tokens for the dark theme.

The renderer-drawn window controls (`app-window-controls`, Windows/Linux) use
white glyphs over the dark top bar. The top bar reserves room for them
(`body.frameless-platform .nf-header`).

### Actualizar contenido

The profile menu's "Actualizar contenido" deletes the line's cached content and
lands on Inicio, which imports it again. The import overlay
(`app-workspace-shell-import-overlay`) shows on every page of the line while
an import or refresh runs, not only on the old category pages. It sits above
the top bar, so navigation is blocked until the import ends. If the import
fails, the overlay closes and the error state is shown.

## Provider DNS scheme (http vs https)

The panel can hand out a line's DNS as `https://` even when the provider only
answers on http, and requests to `https://host:443` then end in `ETIMEDOUT`.
Two layers handle this:

- **Login:** `PanelSessionService.start` runs `resolveReachableServer`
  (`apps/web/src/app/panel-login/server-scheme.util.ts`). It probes
  `player_api.php` with both schemes: the remembered one for the host (else
  the one the panel gave) first, then the other one, so a remembered scheme
  that stopped answering never locks the app out. The working scheme is
  remembered per host (`localStorage.panel_server_scheme:<host>`) and saved as
  the playlist's `serverUrl`. Lines match by host, whatever the
  scheme.
- **Electron `XTREAM_REQUEST`:** after a connection failure on https (timeout,
  refused, TLS error), the request is retried once over http. The host is
  remembered for the run (`xtream-scheme-fallback.ts`).
- **Streams (inline players and embedded MPV):** when a stream fails to play
  (and before the automatic switch to embedded MPV, see below), the web player
  view retries the same URL once on the other scheme — `http://host:80` ↔
  `https://host`, dropping the default port of the scheme being left
  (`withScheme` / `otherSchemeUrl` in
  `libs/shared/interfaces/src/lib/stream-scheme.util.ts`, also used by the
  login probe above). Embedded MPV does the same when it cannot open a stream
  (`EmbeddedMpvPlayerComponent.playbackFailed`). A URL that already played is
  not retried. When the retried scheme plays, it is remembered for the host
  in memory (`rememberStreamScheme`), and later streams of that host start on
  it (`applyPreferredStreamScheme`). `PanelSessionService.start` / `clear`
  forget it (`resetStreamSchemePreference`). External MPV/VLC are not covered.

### Unsupported formats: automatic embedded MPV (Smarters-like)

The inline players (Video.js default, HTML5, ArtPlayer) run on Chromium's
media stack, which cannot play MKV/AVI with AC-3/DTS/TrueHD audio, many HEVC
10-bit/HDR files and other formats. When an inline failure is a format
problem (`PlaybackDiagnostic.externalFallbackRecommended`: unsupported
container or codec, decode error, browser-only access rule, HLS key/DRM) and
embedded MPV is available on the machine
(`EmbeddedMpvAvailabilityService`: the `prepareEmbeddedMpv` bridge method
exists **and** reports `supported: true`, i.e. the native addon and libmpv
runtime are bundled), `WebPlayerViewComponent` switches that stream to
embedded MPV automatically, from the last inline position for VOD (live stays
live). It overrides the player only for the current stream (reset when the
stream URL changes) and never changes the saved player setting. Without
embedded MPV the diagnostic banner stays as before and that stream asks no
more (no reload loop, no new availability check until the stream changes).
The order is: other scheme once → embedded MPV (with the URL that answered) →
diagnostic. Logic:
`libs/ui/playback/src/lib/web-player-view/playback-recovery.ts`.

Embedded MPV ships in the Mac build (`.github/workflows/build-macos.yml`
builds the LGPL FFmpeg/libmpv runtime per arch, cached, and the native addon
with `IPTVNATOR_BUILD_EMBEDDED_MPV=1`). Windows builds made without that flag
(and without a staged `vendor/embedded-mpv/win32-x64` runtime) still ship
without it, so they keep the diagnostic banner.

The inline players do not cap quality: hls.js runs with
`capLevelToPlayerSize: false` and a 120 MB forward buffer, and Video.js VHS
with `limitRenditionByPlayerDimensions: false`
(`libs/ui/playback/src/lib/playback-quality/high-quality-playback.config.ts`),
so 4K renditions are picked whenever the bandwidth allows.

Failed provider requests are only logged. The old native "CAZADOR DE ERRORES"
error box is gone, so background calls such as `get_account_info` no longer
block the app.

## App language (es / en / pt / fr)

The app speaks Spanish (default and fallback), English, Portuguese (Brazil,
`pt.json`) and French through `@ngx-translate`; the MPX / Netflix UI keys
(login, distributor, demo, top bar, Netflix pages, sports, player notices)
live under `MPX` in `apps/web/src/assets/i18n/{es,en,pt,fr}.json`. The other
language files stay as they were and fall back to Spanish.

- **Setting:** `Settings.language` is `auto` (default) or `es`/`en`/`pt`/`fr`.
  `auto` uses the first two letters of the system language
  (`navigator.language`, which Electron takes from the OS); anything else
  becomes Spanish (`resolveAppLanguage` in
  `libs/shared/interfaces/src/lib/app-language.util.ts`). It is chosen in the
  top bar profile menu ("Idioma de la app") or in Settings › General, with
  the options "Automático (idioma del equipo)", Español, English, Português
  and Français, and applies at once: `AppComponent` follows
  `SettingsStore.language()` and calls `TranslateService.use()`.
- **Migration:** the old default was English, so a saved `en` becomes `auto`
  once (`migrateLegacyLanguage`, flag `mpx:language-auto-v1`); a language the
  app no longer offers also becomes `auto`.
- **First render:** the language in use is kept in
  `localStorage['iptvnator:preferred-language']` (`currentAppLanguage()`), so
  the first screen and the panel requests already use it before the settings
  load.
- **Panel requests:** the panel answers its own texts in the app language.
  `lang` goes inside the encrypted `login.php` payload of every action
  (validated `es|en|pt|fr` in the main process), and `?lang=` on
  `progress.php`, `epg.php`, `sports.php`, `tmdb.php`, `alerta.php` and
  `report.php` (`withPanelLang`; `report.php` also carries it in the encrypted
  body). Error-code handling is unchanged; local failures (network, missing
  key, bad reply) are shown with the app's own translated text
  (`panelErrorText`), the panel's own `error`/`message` as sent.
- **Not translated:** server and TMDB titles and names, category names, panel
  texts (alerts, panel errors, fake screen, sports labels sent by the panel),
  brand names and the "DEMO" badge. The Netflix keyword tables in
  `nf/nf-filters.ts` still match the Spanish server data; only their labels
  are translation keys (`MPX.NF.TAG_*`).
- **TMDB:** title search and catalog matching (search, posters, trending)
  stay in `es-MX`; detail calls (plot, cast, seasons, person) use the app
  language: `es-MX`, `en-US`, `pt-BR` or `fr-FR` (`TmdbRuntimeService`). The "Similar" recommendations and the person filmography inside those details are fetched again in `es-MX` (`TmdbApiService`), because they are matched against the Spanish catalog by title.
  The synopsis follows the app language: a non-empty TMDB overview (movie,
  series, Stalker item and each episode of a TMDB season) replaces the
  provider's plot in the field-level merge (`tmdb-merge.ts`,
  `tmdb-episode-merge.ts`); an empty one keeps the provider plot. An overview
  taken from the original-language fallback (TMDB has none in the app
  language, e.g. a Korean one) is marked `overviewFromFallback` and only fills
  an empty provider plot, in every language.
- **Dates:** the clock, sports times, demo end, distributor expiry and the
  account expiry use the app language's format.

## App name and data folder

The product name is **MPX Player** (`productName` in `package.json` / `electron-builder.json`,
`app.setName` in `apps/electron-backend/src/main.ts`). The package `name` stays `LatMpx TV+` and
`main.ts` pins `userData` to `<appData>/LatMpx TV+`, so an update keeps the session, the
distributor code and the settings, and the NSIS uninstaller (`deleteAppDataOnUninstall`, keyed by
the package name) still removes that folder. The default logo (`apps/web/src/assets/images/logo.png`)
is shown in the login and the top bar when no distributor logo is set; platform tiles use
`apps/web/src/assets/images/platforms/*.webp` (Apple TV+, Paramount+ and DC included).
