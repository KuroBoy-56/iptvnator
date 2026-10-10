# Panel Integration

The desktop app (product name "LatMpx TV+") is tied to the operator's IPTV
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
     | 200 | Logs in with the demo user on the first DNS. |
     | 403 | Shows the message and disables the button. |
     | 429 / 400 | Shows the message. |
4. **Session.** `apps/web/src/app/panel-login/panel-session.service.ts` turns
   the line into the app session:
   - It creates or updates one Xtream playlist, named "LatMpx TV+" or "DEMO".
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

## Distributor (multi-tenant)

Each panel user is a **distributor** with a 6-digit number, its own DNS list,
lines, alerts, TMDB key, sports, name, logo and colours. The panel contract
(api/login.php `tenant_config`, error codes) is in the panel README,
"Distribuidores". App id: `windows` (`PANEL_APP_ID`).

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
  for `epg.php` / `sports.php`), `alerta.php` gets `&t=<code>&app=windows`
  (`withTenantQuery`). Tokens and the panel TMDB key are stored per code
  (`tenantStorageSuffix()` = `@t<code>`) so two distributors never share one.
- **Features:** `demo=false` hides Auto-Demo, `alerts=false` skips the panel
  alert, `sports=false` hides "Deportes" and guards `/workspace/sports`.
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

## Automatic DNS (no picker)

There is no DNS or server selector anywhere (the login-screen and Settings
pickers were removed). DNS is handled automatically by
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
`alerta.php?format=json&user&pass&dns&title` for each in-memory alert
account (`getSessionAlertAccounts()`, title = playlist name):

- `type: "expiry"` (3/2/1 days, or 0 / expired): red title, no image. The
  first expiry among the lines wins.
- `type: "welcome"` (more than 3 days, no expiry date, or provider down):
  general text plus the image, resolved as panel root + `image_path`.

The notice is rendered natively from the JSON (text only, `white-space:
pre-line`), not by loading the panel's HTML card: an `srcdoc` iframe with
`allow-scripts allow-same-origin` would have run remote markup with the app's
origin. "Entendido", Esc or Enter close it. Failures show nothing.

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
- Clock and a profile menu: Mi cuenta, Actualizar contenido, Descargas, Ajustes.
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
  `player_api.php` over https and, if that does not answer, over http. The
  working scheme is remembered per host (`localStorage.panel_server_scheme:<host>`)
  and saved as the playlist's `serverUrl`. Lines match by host, whatever the
  scheme.
- **Electron `XTREAM_REQUEST`:** after a connection failure on https (timeout,
  refused, TLS error), the request is retried once over http. The host is
  remembered for the run (`xtream-scheme-fallback.ts`).

Failed provider requests are only logged. The old native "CAZADOR DE ERRORES"
error box is gone, so background calls such as `get_account_info` no longer
block the app.
