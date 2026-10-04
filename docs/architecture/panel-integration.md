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
   - `submit_url`: activates user and password on a DNS.
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
   - It sets the `session_*` keys that `AuthGuard` and the panel sync read.

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

## Secure DNS picker

The DNS picker appears only on the login screen and in Settings
(`app-secure-dns-picker`). Options are listed in `SECURE_DNS_OPTIONS`
(`libs/shared/interfaces/src/lib/panel-bridge.interface.ts`):

- Automatic (default)
- Cloudflare
- Google
- Quad9
- AdGuard
- NextDNS
- OpenDNS

`apps/electron-backend/src/app/panel/secure-dns.service.ts` applies the choice
with `app.configureHostResolver`:

- A provider uses `{ secureDnsMode: 'secure', secureDnsServers: [url] }`.
- Automatic uses `'automatic'`.

The choice is persisted in the Electron store (`SECURE_DNS_MODE`) and applied
again on startup.

The setting covers Chromium networking: the renderer, `net.fetch`, panel calls
and the built-in player.

**Limitation:** external MPV/VLC processes use the operating system resolver,
so the in-app DNS choice does not apply to them.

## Progress and favorites sync

`libs/services/src/lib/panel-sync/` talks to `api/progress.php`.

### Authentication

`PanelProgressClient` authenticates once with the Xtream user and password
(`action: auth`) and keeps only the returned token, in `localStorage` under
`panel_sync_token:<user>`. On a 401 it re-authenticates once.

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
  categoryId}`.

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

## Sports

Route `/workspace/sports` (`apps/web/src/app/sports/`) has its own rail link
(`sports_soccer`). It mirrors the web player's sports page:

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
