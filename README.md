<p align="center">
  <img src="public/logo.svg" alt="PK Anime logo" width="100" height="100" />
</p>

<h1 align="center">PK Anime</h1>

<p align="center">
  A self-hosted, Netflix-style anime library for Smart TVs, computers and phones, built on the AniFlow API.
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Next.js-14.2-black?style=for-the-badge&logo=next.js" alt="Next.js" />
  <img src="https://img.shields.io/badge/TypeScript-5.6-blue?style=for-the-badge&logo=typescript" alt="TypeScript" />
  <img src="https://img.shields.io/badge/TailwindCSS-3.4-38bdf8?style=for-the-badge&logo=tailwindcss" alt="Tailwind CSS" />
  <img src="https://img.shields.io/badge/HLS.js-1.5-orange?style=for-the-badge" alt="Hls.js" />
  <img src="https://img.shields.io/badge/License-MIT-emerald?style=for-the-badge" alt="License" />
</p>

---

## Overview

PK Anime is a personal anime library you host on your own machine and open from any device on your network. The interface is in Spanish.

- **TV and web interfaces**, picked per device: spatial navigation with the remote on Smart TVs, a top bar on computers and bottom tabs on phones.
- **Catalog from AniList**: home rows, advanced search, the airing schedule, details, trailers, related titles and recommendations.
- **List sync with MyAnimeList or AniList**: *Seguir viendo* and *Mi lista* merge your list with this device, statuses and scores can be changed from the anime page, and the player marks episodes as watched.
- **Phone as remote**: pair a phone by QR to control the TV, type searches (the results also show on the phone, and a tap opens one on the TV) and sign in without the TV remote.
- **Player** with dub and subtitle preferences, intro and ending skipping and automatic server failover.

It is built on the [AniFlow API](https://github.com/realmichaelstetson/AniFlow-API), whose embed player, HLS endpoints and REST API it keeps. See [AniFlow API](#aniflow-api).

---

## Library

The site root is a personal anime library for TV browsers (Samsung Tizen, LG webOS, Android TV), computers and phones. The interface is in Spanish. Catalog data comes from AniList through the cached `/api/catalog` endpoints, and episodes play in the same player as the embeds.

**Two interfaces.** The server picks one per request from the User-Agent, so the first render already has the right layout:

- **TV** (Smart TV and set-top browsers): left rail with labelled sections, spatial navigation with the remote, on-screen keyboard.
- **Web** (everything else): top bar with sections, a search box (`/` focuses it) and Ajustes on computers. On phones (below 768 px) it becomes bottom tabs (Inicio, Buscar, Calendario, Mi lista, Perfil), search uses the phone's own keyboard and Ajustes lives under Perfil. Both screens have the same home sections in the same order.

Add `?ui=tv` or `?ui=web` to any library URL to force one on that browser (stored in the `pk_ui` cookie), for a TV whose browser is not recognised; `?ui=auto` goes back to detection.

| Route | Screen |
| :--- | :--- |
| `/` | Home: hero for the focused title, *Seguir viendo*, *Nuevos episodios*, trending, *Porque viste…*, current season, latest episodes, top rated, upcoming and genre rows |
| `/anime/{anilistId}` | Details, Sub/Dub choice, *Mi lista*, the trailer (YouTube or Dailymotion, when AniList has one), episodes in blocks of 50, related titles and recommendations. On TV the trailer plays full screen: OK and play/pause pause it, Back closes it |
| `/watch/{anilistId}/{episode}` | Full-screen player. A moment into a pause it shows the title, synopsis, time left and the next episode; when the ending starts, the next episode with a countdown (the credits keep playing in a frame on computers). *Ajustes* is a side panel with audio, subtitles and their style, quality, speed, volume boost, auto-skip of intro and ending (separately), autoplay of the next episode and live server status. On TV the arrows seek, Down reaches the control row and Back closes panels before leaving |
| `/search` | Advanced search: text plus filters (see below). On TV, an on-screen keyboard and a *Filtros* tab; on the web, the device keyboard with a filter sidebar (a sheet on phones) |
| `/schedule` | Episodes airing in the next 7 days, in the viewer's time zone |
| `/genres`, `/genres/{genre}` | Genre list and a paged grid per genre |
| `/my-list` | Saved series |
| `/settings` | *Ajustes*: playback preferences (audio, subtitle languages in order, server, subtitle format) |
| `/radio` | *Radio de openings*, opened from *Mi lista*: the openings and/or endings of the anime being watched, completed or paused, shuffled or best scored first, played one after another |
| `/stats` | *Estadísticas*, opened from *Mi lista*, for all time or one year (an anime counts in the year it was finished, as MyAnimeList's `finish_date` or AniList's `completedAt` say, or the year of its last change): totals, statuses as one split bar with counts and percentages, anime finished per year or per month, formats, most watched genres, the score distribution and the best scored |
| `/account` | *Cuenta*: list service sign-in, export of local data and phone pairing |
| `/link` | Phone page opened from the TV's QR: remote control, keyboard with the search results (a tap opens the anime on the TV), sending the phone's list to the TV, and sign-in |
| `/license` | MIT license text, copyright holders and credits (linked from every page's footer) |

**Advanced search.** On computers this is the *Biblioteca* section of the top bar (on phones, the *Buscar* tab); with nothing chosen it lists the whole catalog, most popular first. `/search` combines the title text with filters: format (series, movie, special, OVA, ONA…), status, season, a range of years, genres and community tags (each one included or excluded; several of either must all match), source material, number of episodes, minimum score and country of origin, plus the sort order. The state lives in the URL (`/search?q=…&genre=Action&no-genre=Romance&tag=Isekai&format=TV&from=2018&to=2024&sort=SCORE_DESC`), so searches can be shared and survive going back from an anime. Genres and tags on an anime's page, and the genre tiles, open it with that filter applied. On TV every filter is a chip reachable with the remote; tags there are a list of the most common ones, while the web screens search all of them by name.

**Playback preferences.** *Ajustes* stores the preferred audio, an ordered list of subtitle languages, what to show over a dub (full, signs and songs only, or nothing), a preferred server and the subtitle format. When an episode starts, the player:

1. Plays the dub if one exists, otherwise the original audio.
2. Walks the subtitle languages in order and plays from the first server that has the current one: the preferred server first, then the current server, then Flow, Kitty, Buzz, Yuri and Zuri. Yuri and Zuri only list subtitles when asked directly, so they are checked only if no other server has the language.
3. Uses the provider's default track (or English) when no listed language exists anywhere.

If the chosen server fails, the usual failover moves to the next server and picks its best match from the same list. Embeds that set `?server=` keep that server and only choose the track. Toggle *Buscar el idioma en otros servidores* off to never change server for subtitles.

**Remote control.** Arrows move the focus, Enter selects, and Back goes to the previous screen without ever leaving the site. In the player, arrows seek (left/right) and change the volume (up/down), Enter and the remote's play/pause keys toggle playback, and fast-forward/rewind seek 10 s. Back keys recognised: Escape, Backspace, Tizen `10009` and webOS `461`. A pointer (LG Magic Remote, mouse) focuses whatever it moves over.

**Per-device state.** *Mi lista*, the watch history behind *Seguir viendo* and the playback preferences live in the browser's `localStorage`. Progress per episode is the one the player already saves. *Mi lista* is kept like a list service's: every anime has a status, the episodes watched and an optional score, so without signing in it still has the colors, filters and score frames, and the anime page edits it. Watching an episode past 90% counts it as watched there, as on the services. After the last episode of a finished anime (once it ends, or when leaving after watching it), a screen asks for a score from 1 to 10 (each score button plays a manga trope when focused or hovered: a raincloud, an anger vein, «…», Zzz, nothing, blushing cheeks, shōjo flowers, speed lines with ドン, a golden aura and a halo with falling sakura; at rest they all look the same, 9 and 10 included) and marks the anime completed with it, on the service while signed in; *Ahora no* skips it, and it isn't asked again for an anime already completed with a score. Lists saved by earlier versions (plain saved series plus the watch history) are turned into entries on first load.

**Recommendations.** After the first catalog row, up to two *Porque viste …* rows show AniList's recommendations for the latest anime completed (or followed for three episodes or more) that weren't scored below 7, leaving out what's already on a list or in the history.

**Watch order.** The anime page shows *Orden de visionado* when the anime has prequels or sequels: every season, film and OVA reachable through them, by release date (`/api/catalog/franchise/{id}`, side stories and spin-offs left out). Each entry says *Estás aquí*, *Visto*, *Viendo* or *Siguiente* (the first one not completed after the last one completed). The score screen after the last episode also offers the sequel.

**Openings and endings.** The anime page lists its openings and endings from [AnimeThemes](https://animethemes.moe) (song, artists, episodes, spoiler mark) and plays them full screen, one after another; on TV ◀ ▶ change the song, OK pauses and Back closes. `/api/catalog/themes?ids=…` asks AnimeThemes from the server, 25 anime per request, and keeps each answer for 12 hours. The videos are WebM; a browser that can't play one skips to the next.

**Screensaver (TV).** After a few minutes without the remote (3, 5 by default, 10 or 30, or never; *Ajustes* › *Apariencia*), a slow show of the list's artwork with each anime's title, status and score, and the time; the text changes sides every slide. Never over the player or anything playing. Any key closes it without doing anything else.

**Profiles.** Several people can share a device: *Cuenta* (*Perfil* on the web) lists the profiles, adds up to six, renames them (an on-screen keyboard on TV), changes their color and removes them along with what they kept. Each profile has its own *Mi lista*, history, episode progress, list view, recent searches and playback preferences; the theme, the player volume and the phone link stay per device. A linked phone can send its own profile (*Mi lista*, history and episode progress) to the TV from `/link`, without a list service account: the TV asks whether to make a new profile of it or merge it into the active one, never undoing anything there. The data waits in the link's memory on the server until the TV takes it, once. With more than one profile the library asks *¿Quién está viendo?* once per browser session. The first profile keeps the storage keys from before profiles existed and the others add `::<id>` to them (`lib/library/profiles.ts`). Switching to a profile signs out a MyAnimeList or AniList account that another profile was using, so nobody edits someone else's list.

**New episodes.** The lists and the history keep the card saved when an anime was added, so the home screen asks `/api/catalog/cards` for current ones (cached for ten minutes per anime). A show being watched that was caught up and has aired another episode since moves from *Seguir viendo* to *Nuevos episodios*, the row under it, with a *NUEVO* (or *3 NUEVOS*) badge. A card on either row can be taken off (*Quitar* under it on TV, ✕ on the web); it stays off until there's newer activity on that anime, such as an episode opened or a list change.

**List sync.** After signing in with MyAnimeList or AniList (see [List sync sign-in](#list-sync-sign-in-optional)) the library merges this device with the user's list: *Seguir viendo* adds what the list is watching (the furthest episode wins), *Mi lista* shows the whole list, colored by status (green Viendo, grey Pendiente, blue Completado, amber En pausa, red Abandonado) with each entry's score, and marks what exists only on this device (*LOCAL*). It filters by status, score and format and sorts by last update, your score, AniList's average, title or year; the choice is remembered on each device. Covers scored 9 get a gold frame, and 10s an iridescent one with a pulsing glow and a sweeping shine (still when the system asks for reduced motion). The anime page resumes from the list's progress and lets you change the status, the score (0–10) and the episodes watched (one more or less, or all of them; on the web each episode also has a check that marks the series watched up to it), or take the anime off the list. Every episode of a finished anime marks it completed, and progress on a planned or completed one makes it *Viendo*. While signed in, every change (from the anime page or the player) is saved on the service and copied to this device's list, so it stays after signing out. *Exportar* and *Importar* in *Mi lista* or *Cuenta* move entries the other way round when they were changed elsewhere: both copy what the other side lacks and never undo what it has. A missing anime is copied whole (status, progress, score); one on both sides only takes the further progress, with the status that came with it, and a score where there was none. Status changes at the same progress stay on their side. Since the device's list sits in the middle, importing from one service, signing in to the other and exporting moves a list between MyAnimeList and AniList. The list access goes through `lib/trackers`, one adapter per service (`myanimelist.ts`, `anilist.ts`); a session holds one service at a time. AniList sends the catalog cards along with the list, while MyAnimeList entries are matched to AniList by MAL ID.

**Phone as remote.** *Cuenta → Vincular un móvil* shows a QR (and a short code). The phone that opens it becomes a remote control: D-pad, OK, Back, Home, play/pause, ±10 s and a text field that types into the TV's search. From the phone the user can also sign in and hand the session to the TV, so no password is typed with the TV remote. Commands reach the TV over Server-Sent Events. Links are kept in the server's memory, which suits a single self-hosted instance: a code lasts 10 minutes, a linked phone 24 hours without use, and restarting the server drops every link. The phone must reach the server at the same address the TV uses, so open the TV library through the server's LAN address or hostname, not `localhost`.

**Compatibility.** The TV interface avoids CSS that old TV browsers lack (`backdrop-filter`, `aspect-ratio`, `inset`, flex `gap`) and scales its layout with the viewport width, since TVs often report a 960 or 1280 px wide viewport. Next.js 14 targets Chromium 64 and later, which in practice means TVs from around 2020 onwards (Tizen 5.5+, webOS 5+). Older models are not supported. Next.js 15 keeps those targets, but Next.js 16 requires Chrome 111, so the project stays below 16.

**Known limitations.** The player's settings menu (server, quality, subtitles) is not reachable with the arrow keys, which control playback; use a pointer remote to open it. Playback started only from the phone may need one press on the TV's own remote first, since TV browsers block autoplay with sound until the page has received a real key press. AniList has no per-episode metadata for every series, so some episodes show only their number.

---

## Getting Started

### Requirements

- [Node.js](https://nodejs.org/) 18.17.0 or newer
- `npm`, `yarn` or `pnpm`

### Installation

```bash
git clone https://github.com/PilaAlkarina/PK-Anime.git
cd PK-Anime
npm install
```

Start the development server and open [http://localhost:3000](http://localhost:3000):

```bash
npm run dev
```

Build and run for production:

```bash
npm run build
npm run start
```

### List sync sign-in (optional)

Visitors can sign in with MyAnimeList or AniList through [Better Auth](https://www.better-auth.com/). Their list then merges with the library, and episodes they watch past 90% are marked on it. No database is needed: the session and the service's tokens are kept in encrypted cookies, and playback positions are kept in the browser's `localStorage`. Configure one service or both; the sign-in screens offer only the ones with credentials.

1. **MyAnimeList:** create an app at [myanimelist.net/apiconfig](https://myanimelist.net/apiconfig) with App Type **web** and the redirect URL `https://your-domain/api/auth/callback/myanimelist` (`http://localhost:3000/api/auth/callback/myanimelist` for local development).
2. **AniList:** create a client at [anilist.co/settings/developer](https://anilist.co/settings/developer) with the redirect URL `https://your-domain/api/auth/callback/anilist`. AniList takes one redirect URL per client and must match it exactly. Its tokens are long-lived and cannot be refreshed, so when one expires the user signs in again.
3. Copy `.env.example` to `.env.local` and fill it in:

| Variable | Description |
| --- | --- |
| `BETTER_AUTH_SECRET` | Random string of at least 32 characters, used to encrypt the cookies (`openssl rand -base64 32`). |
| `BETTER_AUTH_URL` | Public origin of the site, e.g. `https://your-domain`. When hosted on a local network, use the address the TV and phones open (e.g. `http://192.168.1.50:3000`) and register the redirect URLs with that address. |
| `MAL_CLIENT_ID`, `MAL_CLIENT_SECRET` | Client ID and secret of the MAL app. |
| `ANILIST_CLIENT_ID`, `ANILIST_CLIENT_SECRET` | Client ID and secret of the AniList client. |

The session cookie only reaches the player on your own domain. Inside embeds on other sites the browser treats it as a third-party cookie and blocks it, so syncing is skipped there.

---

## AniFlow API

The streaming layer comes from AniFlow and stays usable on its own, for embedding anime in another site or app: drop in a single iframe, call the REST API, or point any HLS-capable player at a plain `.m3u8` URL. Its documentation page, with a demo player, is at `/aniflow-doc`.

Key points:

- **Five servers** (`Flow`, `Kitty`, `Yuri`, `Zuri`, `Buzz`) with per-request server selection.
- **Direct HLS endpoints** at `/meu8/ani/...` and `/meu8/mal/...`, usable from VLC, mpv, ExoPlayer, AVPlayer or a plain `<video>` tag.
- **Dub verification.** Servers that silently fall back to Japanese audio are excluded from the dub list.
- **AniList and MyAnimeList IDs** are both supported (`/embed/ani/...`, `/embed/mal/...`).
- **Intro/outro skipping** using Re:ANIME timestamps and the AniSkip API, adjusted for episode duration.
- **Subtitle proxy** with up to 16 languages. The selected track persists when you switch servers.
- **Dark, minimal player** with a two-way `postMessage` interface for telemetry and remote control.

### Servers

| Server | Upstream | Audio | Notes |
| :--- | :--- | :--- | :--- |
| **Flow** | Re:ANIME (HD-1) | `SUB`, `DUB` | Primary server. Uses Re:ANIME's own OP/ED timestamps. |
| **Kitty** | Re:ANIME (HD-2) | `SUB`, `DUB` | Backup mirror for Flow, with the same skip-time support. |
| **Yuri** | AniEmbed Core | `SUB`, `DUB` | Soft subtitles, up to 16 external languages. |
| **Zuri** | AniEmbed Zuna | `SUB` only | Japanese-audio backup. |
| **Buzz** | MegaPlay Buzz | `SUB`, `DUB` | Served through the edge `.m3u8` proxy, with key handling. |

**Server status.** `GET /api/status` checks every server the way the player uses it: it resolves episode 1 of Attack on Titan through `/api/play`, then fetches the playlist, the quality playlist and the first video segment through the proxies. It also checks AniList and AniSkip. Each service is reported as `ok`, `degraded` (works, but slower than 8 s) or `down`, with its latency and the step that failed. Results are cached for 5 minutes; `?refresh=1` forces a new check, at most once a minute. The *Status* section of `/aniflow-doc` and the library's `/status` page show it; the library links to that page from its footer (with a dot for the last result) and from *Perfil* on phones.

**HTTPS fallback.** Some stream CDNs (MegaPlay's segment hosts, behind Yuri, Zuri and Buzz) answer on port 80 but refuse HTTPS connections. When an upstream refuses or drops the connection itself, the segment and playlist proxies retry the same URL over HTTP. They remember that host for 10 minutes, so later segments skip the failed TLS attempt. These requests are made by the server, never by the browser, and HTTP error responses are passed on unchanged. `/api/status` lists the hosts currently fetched this way.

#### Dub verification

Some providers return the original Japanese audio when an English dub doesn't exist for an episode, without any indication. AniFlow checks for this at both the API and player level:

- Audio streams are inspected before they are returned.
- A server that falls back to Japanese audio is left out of the dub list.
- If an anime has no English dub at all, the Dub option is disabled and the player switches to Sub with a notification.

### Player

- **Interface:** blurred floating controls and a minimal layout. Controls hide during playback.
- **Skip intro/outro:** OP and ED segments are marked on the timeline. Skipping can be automatic or triggered with a button. Flow and Kitty use native Re:ANIME timestamps; Yuri, Zuri and Buzz use AniSkip with duration compensation.
- **Subtitles:** up to 16 languages (English, Spanish, French, German, Italian, Portuguese, Polish, Russian and more). The chosen track carries over when you change servers. Font (Sans, Anime, Serif, Mono), size, color, background opacity and outline are adjustable.
- **Audio and video:**
  - Volume boost up to 200% via the Web Audio API.
  - Playback speed from 0.25x to 2.0x.
  - Adaptive bitrate, or a fixed resolution (1080p, 720p, 480p, 360p).
- **Mobile:** tap to toggle controls, double-tap left or right to seek ±10 s, and automatic landscape lock in fullscreen.

### API Reference

#### Embed URLs

AniList:
```http
GET /embed/ani/{anilistId}/{episode}/{audio}?server={server}
```

MyAnimeList:
```http
GET /embed/mal/{malId}/{episode}/{audio}?server={server}
```

**Path parameters**

| Parameter | Type | Required | Description |
| :--- | :--- | :--- | :--- |
| `anilistId` / `malId` | `number` | Yes | Anime ID from AniList or MyAnimeList. |
| `episode` | `number` | Yes | Episode number (e.g. `1`, `12`). |
| `audio` | `string` | No | `sub` (default) or `dub`. |

**Query parameters**

| Parameter | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `server` | `string` | `flow` | One of `flow`, `kitty`, `yuri`, `zuri`, `buzz`. |
| `startAt` / `progress` | `number` | `0` | Start playback at this offset, in seconds. |
| `autoskipIntro` | `1` \| `0` | `1` | Skip opening themes automatically. |
| `autoskipOutro` | `1` \| `0` | `1` | Skip ending themes automatically. |
| `parentHost` | `string` | auto | Parent domain, for cases where the referer is stripped. |

---

#### Direct HLS streams

Use these endpoints to stream without an iframe, in a `<video>` tag, a mobile app, VLC or mpv.

AniList:
```http
GET /meu8/ani/{anilistId}/{episode}/{audio}?server={server}
```

MyAnimeList:
```http
GET /meu8/mal/{malId}/{episode}/{audio}?server={server}
```

Examples:
```bash
# English dub, episode 1, in VLC
vlc "https://your-domain.com/meu8/ani/16498/1/dub"

# Japanese sub, episode 1, using the Yuri server, in mpv
mpv "https://your-domain.com/meu8/ani/16498/1/sub?server=yuri"

# Inspect the response headers
curl -IL "https://your-domain.com/meu8/mal/16498/1/dub"
```

- The response is an `#EXTM3U` manifest with `Content-Type: application/vnd.apple.mpegurl`.
- `audio` (`sub` or `dub`) goes in the path, and `server` in the query string.
- The same streams are also available at `/m3u8/ani/...` and `/m3u8/mal/...`, or via `GET /api/play?anilistId=16498&episode=1&format=m3u8`.

---

#### REST endpoints

##### `GET /api/play`

Returns stream manifests, proxy URLs and subtitle tracks as JSON.

```http
GET /api/play?anilistId=16498&episode=1&audio=sub&server=flow
```

Add `&format=m3u8` to get the raw playlist instead of JSON.

##### `POST /api/play`

Creates a playback ticket and returns the stream, subtitles and skip times.

```bash
curl -X POST https://your-domain.com/api/play \
  -H "Content-Type: application/json" \
  -d '{
    "anilistId": 16498,
    "episode": 1,
    "audio": "sub",
    "server": "flow",
    "startAt": 0
  }'
```

Response:
```json
{
  "success": true,
  "ticket": "9f8a3d1b-...",
  "embedUrl": "https://your-domain.com/embed?t=9f8a3d1b-...",
  "stream": {
    "url": "https://your-domain.com/api/proxy/m3u8?url=...",
    "format": "hls",
    "server": "flow",
    "audio": "sub",
    "subtitles": [
      { "language": "English", "url": "https://your-domain.com/api/proxy/subtitles?url=..." }
    ],
    "skipTimes": {
      "intro": { "start": 90, "end": 180 },
      "outro": { "start": 1320, "end": 1410 }
    }
  }
}
```

##### `GET /api/anime/skip-times`

Returns OP/ED timestamps from AniSkip, scaled to the given episode duration.

```http
GET /api/anime/skip-times?malId=16498&episode=1&duration=1440
```

##### `GET /api/anime/flow-skip-times`

Returns Re:ANIME's native skip markers, used by Flow and Kitty.

```http
GET /api/anime/flow-skip-times?anilistId=16498&episode=1
```

##### Catalog

Normalized AniList data for the TV library, cached on the server (rows 15 min, details 6 h, schedule 30 min, genres 1 day) so clients never hit AniList's rate limit. Errors use the same `{ success, code, error }` shape as the other endpoints.

| Endpoint | Returns |
| :--- | :--- |
| `GET /api/catalog/home` | The home rows, fetched from AniList in a single query |
| `GET /api/catalog/row?kind={kind}&value={value}&page={n}` | One page of a row. `kind`: `trending`, `season`, `next-season`, `top-rated`, `airing`, `upcoming`, `latest`, `genre`, `tag`, `search` (these three need `value`) or `filter`, whose `value` is the advanced search's query string, e.g. `genre=Action&format=TV&from=2020` |
| `GET /api/catalog/anime/{anilistId}` | Details, relations, recommendations and streaming episode titles |
| `GET /api/catalog/schedule?from={unix}&to={unix}` | Airing episodes in a range of up to 8 days (default: the next 7) |
| `GET /api/catalog/genres` | Genre names with Spanish labels |
| `GET /api/catalog/tags` | Community tags (name, description, category), adult ones excluded |

```http
GET /api/catalog/row?kind=genre&value=Romance&page=2
```

##### List sync and pairing

Cookie-authenticated routes for the TV library; they are left out of the open API CORS and reject cross-site writes.

| Endpoint | Purpose |
| :--- | :--- |
| `GET /api/tracker/me` | Signed-in account, its provider and the providers configured on the server |
| `GET /api/tracker/library` | The whole remote list, with status and score; entries AniList knows come with catalog cards |
| `POST /api/tracker/progress` | `{ anilistId | malId, episode }`: mark an episode watched (never lowers progress). `/api/mal/list-status` is an alias |
| `POST /api/tracker/plan` | `{ items: [{ anilistId, malId }] }`: add up to 25 anime as planned, skipping those already listed |
| `PATCH /api/tracker/entry` | `{ anilistId | malId, status?, score?, progress? }`: set the status, score (0 or `null` clears it) and/or episodes watched, adding the anime if needed. Marking it completed also fills in the episode count |
| `DELETE /api/tracker/entry` | `{ anilistId | malId }`: take the anime off the list |
| `POST /api/pair` | The TV's link: an existing one, or a new QR with `create: true` |
| `GET /api/pair/events?tv={token}` | Server-Sent Events for the TV: linked, unlinked, commands, session offers |
| `POST /api/pair/claim` | `{ code }`: the phone takes over the link and gets its remote token |
| `GET`, `POST /api/pair/remote` | Link status, and remote commands (`key`, `text`, `navigate`, `signout`) |
| `POST /api/pair/session`, `/api/pair/session/accept` | The phone offers its sign-in; the TV picks it up |
| `POST /api/pair/unlink` | Either side ends the link |

### Usage Examples

#### HTML iframe

```html
<div style="position: relative; padding-bottom: 56.25%; height: 0; overflow: hidden; border-radius: 16px;">
  <iframe
    src="https://your-domain.com/embed/ani/16498/1/sub?server=flow&autoskipIntro=1"
    style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; border: 0;"
    allowfullscreen
    allow="autoplay; fullscreen; picture-in-picture"
  ></iframe>
</div>
```

#### React / Next.js

```tsx
import React from "react";

interface AnimePlayerProps {
  anilistId: number;
  episode?: number;
  audio?: "sub" | "dub";
  server?: "flow" | "kitty" | "yuri" | "zuri" | "buzz";
  autoSkip?: boolean;
}

export function AnimePlayer({
  anilistId,
  episode = 1,
  audio = "sub",
  server = "flow",
  autoSkip = true,
}: AnimePlayerProps) {
  const embedUrl = `https://your-domain.com/embed/ani/${anilistId}/${episode}/${audio}?server=${server}&autoskipIntro=${autoSkip ? 1 : 0}`;

  return (
    <div className="relative aspect-video w-full rounded-2xl overflow-hidden bg-black shadow-2xl">
      <iframe
        src={embedUrl}
        className="w-full h-full border-0"
        allow="autoplay; fullscreen; picture-in-picture"
        allowFullScreen
      />
    </div>
  );
}
```

#### HTML5 `<video>` with HLS.js

Load a raw playlist without an iframe, using [hls.js](https://github.com/video-dev/hls.js/) or the native HLS support in Safari and iOS:

```html
<video id="video" controls autoplay playsinline style="width: 100%; max-width: 800px; border-radius: 12px;"></video>

<script src="https://cdn.jsdelivr.net/npm/hls.js@1"></script>
<script>
  const video = document.getElementById('video');
  const streamUrl = 'https://your-domain.com/meu8/ani/16498/1/sub';

  if (Hls.isSupported()) {
    const hls = new Hls();
    hls.loadSource(streamUrl);
    hls.attachMedia(video);
  } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
    // Native HLS (Safari / iOS)
    video.src = streamUrl;
  }
</script>
```

#### `postMessage` integration

The embedded player sends events to the parent window and accepts commands from it.

Listening for events:
```javascript
window.addEventListener("message", (event) => {
  const data = event.data;
  if (!data) return;

  // Playback state changes
  if (data.type === "PLAYER_EVENT") {
    console.log("Player event:", data.data);
    // Payload: { type: "play" | "pause" | "time" | "complete" | "error", currentTime, duration }
  }

  // Watch progress, roughly once per second
  if (data.type === "watching-log") {
    console.log("Progress:", data.currentTime, "/", data.duration);
  }
});
```

Sending commands:
```javascript
const playerIframe = document.getElementById("aniflow-player");

playerIframe.contentWindow.postMessage({ command: "play" }, "*");
playerIframe.contentWindow.postMessage({ command: "pause" }, "*");

// Seek to a position, in seconds
playerIframe.contentWindow.postMessage({ command: "seek", time: 120 }, "*");

// Request a snapshot of the current playback state
playerIframe.contentWindow.postMessage({ command: "getStatus" }, "*");
```

---

## Project Structure

```
pk-anime/
├── app/
│   ├── (library)/                # TV library at / (home, anime, watch, search, schedule, genres, my-list, account)
│   ├── aniflow-doc/              # Documentation page with demo player
│   ├── api/
│   │   ├── anime/
│   │   │   ├── flow-skip-times/  # Re:ANIME OP/ED skip extraction
│   │   │   └── skip-times/       # AniSkip integration with duration adjustment
│   │   ├── auth/                 # Better Auth handler (MyAnimeList sign-in)
│   │   ├── catalog/              # Cached AniList catalog for the TV library
│   │   ├── m3u8/                 # Direct HLS stream aliases
│   │   ├── mal/                  # MAL authorize shim; list-status aliases tracker/progress
│   │   ├── pair/                 # Phone ↔ TV pairing, remote commands and session hand-over
│   │   ├── play/                 # Stream resolver and ticket creation
│   │   ├── proxy/                # HLS proxy (m3u8, segments, subtitles, keys)
│   │   └── tracker/              # List sync for the signed-in account
│   ├── embed/
│   │   ├── ani/[anilistId]/      # AniList embed routes
│   │   └── mal/[malId]/          # MyAnimeList embed routes
│   ├── meu8/
│   │   ├── ani/[anilistId]/      # AniList direct M3U8 routes
│   │   └── mal/[malId]/          # MyAnimeList direct M3U8 routes
│   ├── link/                     # Phone remote page opened from the TV's QR
│   ├── globals.css               # Global styles and theme
│   └── layout.tsx                # Root layout shared by every route
├── components/
│   ├── remote/                   # Phone remote UI
│   ├── tv/                       # TV library screens and remote-control navigation
│   ├── web/                      # Library screens for computers and phones
│   └── player/
│       ├── embed-player.tsx      # HLS player
│       ├── embed-page-client.tsx # Embed page wrapper
│       └── player-core/          # Player state and subtitle helpers
├── lib/
│   ├── anilist/                  # AniList client, queries and cached catalog
│   ├── library/                  # Per-device stores, remote list merge and export
│   ├── pairing/                  # In-memory phone ↔ TV links
│   ├── trackers/                 # List service adapters (MyAnimeList, AniList)
│   ├── tv/                       # Remote key mapping and scroll helpers
│   ├── aniembed-extractor.ts     # Yuri and Zuri extraction
│   ├── aniskip.ts                # AniSkip client
│   ├── buzz.ts                   # Buzz (MegaPlay) extraction and proxying
│   ├── reanime.ts                # Flow and Kitty extraction
│   ├── skip-times-adapter.ts     # Skip-time scaling and fallback logic
│   └── utils.ts                  # Shared helpers
├── shared/
│   └── validators.ts             # Input validation and schemas
├── public/                       # Static assets and logos
└── tailwind.config.ts            # Design tokens
```

---

## Docker

```dockerfile
FROM node:18-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
RUN npm ci --only=production
COPY . .
RUN npm run build
EXPOSE 3000
CMD ["npm", "start"]
```

```bash
docker build -t pk-anime .
docker run -p 3000:3000 --env-file .env.local pk-anime
```

---

## Legal Notice

PK Anime, like the AniFlow API it builds on, is an open-source stream aggregator and playback client intended for educational and integration purposes. It does not host, store or upload any video files or copyrighted media. All streams and metadata are resolved at request time from third-party sources that are publicly reachable.

Copyright claims and DMCA requests should be sent to the relevant upstream hosts.

---

## Credits and License

PK Anime is built on the [AniFlow API](https://github.com/realmichaelstetson/AniFlow-API) by AniFlow. Catalog data and images come from [AniList](https://anilist.co), and list sync uses AniList and [MyAnimeList](https://myanimelist.net); PK Anime is not affiliated with either.

Released under the [MIT License](LICENSE), which keeps AniFlow's copyright notice alongside PK Anime's. The library shows the license and these credits at `/license`, linked from every page's footer.
