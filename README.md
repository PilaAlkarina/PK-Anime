<p align="center">
  <img src="public/logo.svg" alt="AniFlow Logo" width="100" height="100" />
</p>

<h1 align="center">AniFlow API</h1>

<p align="center">
  Self-hostable anime embed API and HLS player. Pass an AniList or MAL ID, get a working stream.
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

AniFlow is a self-hostable backend and player for embedding anime on your own site or app. You can drop in a single iframe, call the REST API, or point any HLS-capable player at a plain `.m3u8` URL.

Key points:

- **Five servers** (`Flow`, `Kitty`, `Yuri`, `Zuri`, `Buzz`) with per-request server selection.
- **Direct HLS endpoints** at `/meu8/ani/...` and `/meu8/mal/...`, usable from VLC, mpv, ExoPlayer, AVPlayer or a plain `<video>` tag.
- **Dub verification.** Servers that silently fall back to Japanese audio are excluded from the dub list.
- **AniList and MyAnimeList IDs** are both supported (`/embed/ani/...`, `/embed/mal/...`).
- **Intro/outro skipping** using Re:ANIME timestamps and the AniSkip API, adjusted for episode duration.
- **Subtitle proxy** with up to 16 languages. The selected track persists when you switch servers.
- **Dark, minimal player** with a two-way `postMessage` interface for telemetry and remote control.
- **TV library** at `/`: a Netflix-style catalog built on AniList, with a remote-control interface for Smart TVs and a web one for computers and phones. See [TV library](#tv-library).

---

## Servers

| Server | Upstream | Audio | Notes |
| :--- | :--- | :--- | :--- |
| **Flow** | Re:ANIME (HD-1) | `SUB`, `DUB` | Primary server. Uses Re:ANIME's own OP/ED timestamps. |
| **Kitty** | Re:ANIME (HD-2) | `SUB`, `DUB` | Backup mirror for Flow, with the same skip-time support. |
| **Yuri** | AniEmbed Core | `SUB`, `DUB` | Soft subtitles, up to 16 external languages. |
| **Zuri** | AniEmbed Zuna | `SUB` only | Japanese-audio backup. |
| **Buzz** | MegaPlay Buzz | `SUB`, `DUB` | Served through the edge `.m3u8` proxy, with key handling. |

### Dub verification

Some providers return the original Japanese audio when an English dub doesn't exist for an episode, without any indication. AniFlow checks for this at both the API and player level:

- Audio streams are inspected before they are returned.
- A server that falls back to Japanese audio is left out of the dub list.
- If an anime has no English dub at all, the Dub option is disabled and the player switches to Sub with a notification.

---

## Player

- **Interface:** blurred floating controls and a minimal layout. Controls hide during playback.
- **Skip intro/outro:** OP and ED segments are marked on the timeline. Skipping can be automatic or triggered with a button. Flow and Kitty use native Re:ANIME timestamps; Yuri, Zuri and Buzz use AniSkip with duration compensation.
- **Subtitles:** up to 16 languages (English, Spanish, French, German, Italian, Portuguese, Polish, Russian and more). The chosen track carries over when you change servers. Font (Sans, Anime, Serif, Mono), size, color, background opacity and outline are adjustable.
- **Audio and video:**
  - Volume boost up to 200% via the Web Audio API.
  - Playback speed from 0.25x to 2.0x.
  - Adaptive bitrate, or a fixed resolution (1080p, 720p, 480p, 360p).
- **Mobile:** tap to toggle controls, double-tap left or right to seek ±10 s, and automatic landscape lock in fullscreen.

---

## TV library

The site root is a personal anime library for TV browsers (Samsung Tizen, LG webOS, Android TV), computers and phones. The interface is in Spanish. Catalog data comes from AniList through the cached `/api/catalog` endpoints, and episodes play in the same player as the embeds.

**Two interfaces.** The server picks one per request from the User-Agent, so the first render already has the right layout:

- **TV** (Smart TV and set-top browsers): left rail with labelled sections, spatial navigation with the remote, on-screen keyboard.
- **Web** (everything else): top bar with sections, a search box (`/` focuses it) and Ajustes on computers. On phones (below 768 px) it becomes bottom tabs (Inicio, Buscar, Calendario, Mi lista, Perfil), search uses the phone's own keyboard and Ajustes lives under Perfil. Both screens have the same home sections in the same order.

Add `?ui=tv` or `?ui=web` to any library URL to force one on that browser (stored in the `pk_ui` cookie), for a TV whose browser is not recognised; `?ui=auto` goes back to detection.

| Route | Screen |
| :--- | :--- |
| `/` | Home: hero for the focused title, *Seguir viendo*, trending, current season, latest episodes, top rated, upcoming and genre rows |
| `/anime/{anilistId}` | Details, Sub/Dub choice, *Mi lista*, the trailer (YouTube or Dailymotion, when AniList has one), episodes in blocks of 50, related titles and recommendations. On TV the trailer plays full screen: OK and play/pause pause it, Back closes it |
| `/watch/{anilistId}/{episode}` | Full-screen player with a countdown to the next episode |
| `/search` | Advanced search: text plus filters (see below). On TV, an on-screen keyboard and a *Filtros* tab; on the web, the device keyboard with a filter sidebar (a sheet on phones) |
| `/schedule` | Episodes airing in the next 7 days, in the viewer's time zone |
| `/genres`, `/genres/{genre}` | Genre list and a paged grid per genre |
| `/my-list` | Saved series |
| `/settings` | *Ajustes*: playback preferences (audio, subtitle languages in order, server, subtitle format) |
| `/account` | *Cuenta*: list service sign-in, export of local data and phone pairing |
| `/link` | Phone page opened from the TV's QR: remote control, keyboard and sign-in |

**Advanced search.** `/search` combines the title text with filters: format (series, movie, special, OVA, ONA…), status, season, a range of years, genres and community tags (each one included or excluded; several of either must all match), source material, number of episodes, minimum score and country of origin, plus the sort order. The state lives in the URL (`/search?q=…&genre=Action&no-genre=Romance&tag=Isekai&format=TV&from=2018&to=2024&sort=SCORE_DESC`), so searches can be shared and survive going back from an anime. Genres and tags on an anime's page, and the genre tiles, open it with that filter applied. On TV every filter is a chip reachable with the remote; tags there are a list of the most common ones, while the web screens search all of them by name.

**Playback preferences.** *Ajustes* stores the preferred audio, an ordered list of subtitle languages, what to show over a dub (full, signs and songs only, or nothing), a preferred server and the subtitle format. When an episode starts, the player:

1. Plays the dub if one exists, otherwise the original audio.
2. Walks the subtitle languages in order and plays from the first server that has the current one: the preferred server first, then the current server, then Flow, Kitty, Buzz, Yuri and Zuri. Yuri and Zuri only list subtitles when asked directly, so they are checked only if no other server has the language.
3. Uses the provider's default track (or English) when no listed language exists anywhere.

If the chosen server fails, the usual failover moves to the next server and picks its best match from the same list. Embeds that set `?server=` keep that server and only choose the track. Toggle *Buscar el idioma en otros servidores* off to never change server for subtitles.

**Remote control.** Arrows move the focus, Enter selects, and Back goes to the previous screen without ever leaving the site. In the player, arrows seek (left/right) and change the volume (up/down), Enter and the remote's play/pause keys toggle playback, and fast-forward/rewind seek 10 s. Back keys recognised: Escape, Backspace, Tizen `10009` and webOS `461`. A pointer (LG Magic Remote, mouse) focuses whatever it moves over.

**Per-device state.** *Mi lista*, the watch history behind *Seguir viendo* and the playback preferences live in the browser's `localStorage`. Progress per episode is the one the player already saves.

**List sync.** After signing in with MyAnimeList (see [MyAnimeList sign-in](#myanimelist-sign-in-optional)) the library merges this device with the user's list: *Seguir viendo* adds what the list is watching (the furthest episode wins), *Mi lista* adds planned entries and marks the ones that exist only on this device (*LOCAL*) or only on the list (*MAL*), and the anime page resumes from the list's progress. *Exportar* in *Mi lista* or *Cuenta* copies local-only entries as planned and local progress ahead of the list, without lowering anything already there. Watched episodes keep syncing from the player as before. The list access goes through `lib/trackers`, an adapter per service, so AniList can be added as a second provider.

**Phone as remote.** *Cuenta → Vincular un móvil* shows a QR (and a short code). The phone that opens it becomes a remote control: D-pad, OK, Back, Home, play/pause, ±10 s and a text field that types into the TV's search. From the phone the user can also sign in and hand the session to the TV, so no password is typed with the TV remote. Commands reach the TV over Server-Sent Events. Links are kept in the server's memory, which suits a single self-hosted instance: a code lasts 10 minutes, a linked phone 24 hours without use, and restarting the server drops every link. The phone must reach the server at the same address the TV uses, so open the TV library through the server's LAN address or hostname, not `localhost`.

**Compatibility.** The TV interface avoids CSS that old TV browsers lack (`backdrop-filter`, `aspect-ratio`, `inset`, flex `gap`) and scales its layout with the viewport width, since TVs often report a 960 or 1280 px wide viewport. Next.js 14 targets Chromium 64 and later, which in practice means TVs from around 2020 onwards (Tizen 5.5+, webOS 5+). Older models are not supported.

**Known limitations.** The player's settings menu (server, quality, subtitles) is not reachable with the arrow keys, which control playback; use a pointer remote to open it. Playback started only from the phone may need one press on the TV's own remote first, since TV browsers block autoplay with sound until the page has received a real key press. AniList has no per-episode metadata for every series, so some episodes show only their number.

---

## API Reference

### Embed URLs

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

### Direct HLS streams

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

### REST endpoints

#### `GET /api/play`

Returns stream manifests, proxy URLs and subtitle tracks as JSON.

```http
GET /api/play?anilistId=16498&episode=1&audio=sub&server=flow
```

Add `&format=m3u8` to get the raw playlist instead of JSON.

#### `POST /api/play`

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

#### `GET /api/anime/skip-times`

Returns OP/ED timestamps from AniSkip, scaled to the given episode duration.

```http
GET /api/anime/skip-times?malId=16498&episode=1&duration=1440
```

#### `GET /api/anime/flow-skip-times`

Returns Re:ANIME's native skip markers, used by Flow and Kitty.

```http
GET /api/anime/flow-skip-times?anilistId=16498&episode=1
```

#### Catalog

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

#### List sync and pairing

Cookie-authenticated routes for the TV library; they are left out of the open API CORS and reject cross-site writes.

| Endpoint | Purpose |
| :--- | :--- |
| `GET /api/tracker/me` | Signed-in account, its provider and the providers configured on the server |
| `GET /api/tracker/library` | The whole remote list; watching and planned entries come with catalog cards |
| `POST /api/tracker/progress` | `{ anilistId | malId, episode }`: mark an episode watched (never lowers progress). `/api/mal/list-status` is an alias |
| `POST /api/tracker/plan` | `{ items: [{ anilistId, malId }] }`: add up to 25 anime as planned, skipping those already listed |
| `POST /api/pair` | The TV's link: an existing one, or a new QR with `create: true` |
| `GET /api/pair/events?tv={token}` | Server-Sent Events for the TV: linked, unlinked, commands, session offers |
| `POST /api/pair/claim` | `{ code }`: the phone takes over the link and gets its remote token |
| `GET`, `POST /api/pair/remote` | Link status, and remote commands (`key`, `text`, `navigate`, `signout`) |
| `POST /api/pair/session`, `/api/pair/session/accept` | The phone offers its sign-in; the TV picks it up |
| `POST /api/pair/unlink` | Either side ends the link |

---

## Usage Examples

### HTML iframe

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

### React / Next.js

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

### HTML5 `<video>` with HLS.js

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

### `postMessage` integration

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
aniflow-api/
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
│   ├── trackers/                 # List service adapters (MyAnimeList)
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

## Getting Started

### Requirements

- [Node.js](https://nodejs.org/) 18.17.0 or newer
- `npm`, `yarn` or `pnpm`

### Installation

```bash
git clone https://github.com/realmichaelstetson/AniFlow-API.git
cd AniFlow-API
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

### MyAnimeList sign-in (optional)

Visitors can sign in with MyAnimeList through [Better Auth](https://www.better-auth.com/). Episodes they watch past 90% are then added to their MAL list. No database is needed: the session and MAL tokens are kept in encrypted cookies, and playback positions are kept in the browser's `localStorage`.

1. Create an app at [myanimelist.net/apiconfig](https://myanimelist.net/apiconfig) with App Type **web** and the redirect URL `https://your-domain/api/auth/callback/myanimelist` (`http://localhost:3000/api/auth/callback/myanimelist` for local development).
2. Copy `.env.example` to `.env.local` and fill it in:

| Variable | Description |
| --- | --- |
| `BETTER_AUTH_SECRET` | Random string of at least 32 characters, used to encrypt the cookies (`openssl rand -base64 32`). |
| `BETTER_AUTH_URL` | Public origin of the site, e.g. `https://your-domain`. When hosted on a local network, use the address the TV and phones open (e.g. `http://192.168.1.50:3000`) and register that redirect URL in the MAL app. |
| `MAL_CLIENT_ID` | Client ID of the MAL app. |
| `MAL_CLIENT_SECRET` | Client secret of the MAL app. |

The session cookie only reaches the player on your own domain. Inside embeds on other sites the browser treats it as a third-party cookie and blocks it, so syncing is skipped there.

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
docker build -t aniflow-api .
docker run -p 3000:3000 aniflow-api
```

---

## Legal Notice

AniFlow is an open-source stream aggregator and playback client intended for educational and integration purposes. It does not host, store or upload any video files or copyrighted media. All streams and metadata are resolved at request time from third-party sources that are publicly reachable.

Copyright claims and DMCA requests should be sent to the relevant upstream hosts.

---

## License

Released under the [MIT License](LICENSE).
