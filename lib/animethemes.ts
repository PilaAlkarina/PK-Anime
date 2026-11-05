/**
 * Openings and endings from AnimeThemes (https://animethemes.moe), looked up by AniList ID. Their
 * API is public and free; it's asked from the server and cached per anime, so viewers never call
 * it themselves and its rate limit (90 requests a minute) is shared.
 */

const API = "https://api.animethemes.moe/anime";
const TTL_MS = 12 * 60 * 60 * 1000;
const CHUNK = 25;
const MAX_CACHE = 20_000;

export interface AnimeTheme {
  /** AnimeThemes' theme ID */
  id: number;
  anilistId: number;
  type: "OP" | "ED";
  /** 1 for OP1; null when the show has a single one */
  sequence: number | null;
  /** "OP1", "ED2" */
  slug: string;
  title: string | null;
  artists: string[];
  /** Episodes it plays on, as AnimeThemes writes them ("1-19") */
  episodes: string | null;
  /** WebM video */
  video: string;
  resolution: number | null;
  /** Ogg audio, when there is one */
  audio: string | null;
  spoiler: boolean;
  nsfw: boolean;
}

interface RawVideo {
  link: string;
  resolution: number | null;
  nc: boolean;
  audio?: { link: string } | null;
}
interface RawAnime {
  resources: { site: string; external_id: number }[];
  animethemes: {
    id: number;
    type: string;
    sequence: number | null;
    slug: string;
    song: { title: string | null; artists?: { name: string }[] } | null;
    animethemeentries: { episodes: string | null; spoiler: boolean; nsfw: boolean; videos: RawVideo[] }[];
  }[];
}

const cache = new Map<number, { themes: AnimeTheme[]; expires: number }>();

/** The lightest good video: creditless when there is one, then the lowest resolution from 720 up */
function pickVideo(videos: RawVideo[]) {
  const score = (v: RawVideo) => (v.nc ? 0 : 10_000) + Math.abs((v.resolution ?? 720) - 720);
  return [...videos].sort((a, b) => score(a) - score(b))[0];
}

function toThemes(anime: RawAnime, anilistId: number): AnimeTheme[] {
  const themes: AnimeTheme[] = [];
  for (const t of anime.animethemes) {
    if (t.type !== "OP" && t.type !== "ED") continue;
    // The first version with a video; later ones are mostly the same song with other footage
    const entry = t.animethemeentries.find((e) => e.videos.length > 0);
    if (!entry) continue;
    const video = pickVideo(entry.videos);
    themes.push({
      id: t.id,
      anilistId,
      type: t.type,
      sequence: t.sequence,
      slug: t.slug,
      title: t.song?.title ?? null,
      artists: (t.song?.artists ?? []).map((a) => a.name),
      episodes: entry.episodes,
      video: video.link,
      resolution: video.resolution,
      audio: video.audio?.link ?? null,
      spoiler: entry.spoiler,
      nsfw: entry.nsfw,
    });
  }
  // OP1, OP2…, then ED1, ED2…
  return themes.sort((a, b) => (a.type === b.type ? (a.sequence ?? 0) - (b.sequence ?? 0) : a.type === "OP" ? -1 : 1));
}

async function fetchChunk(ids: number[]): Promise<Map<number, AnimeTheme[]>> {
  const params = new URLSearchParams({
    "filter[has]": "resources",
    "filter[site]": "AniList",
    "filter[external_id]": ids.join(","),
    include: "resources,animethemes.animethemeentries.videos.audio,animethemes.song.artists",
    "page[size]": String(CHUNK * 2),
  });
  const res = await fetch(`${API}?${params}`, {
    headers: { Accept: "application/json", "User-Agent": "PK-Anime" },
    cache: "no-store",
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`AnimeThemes answered ${res.status}`);
  const data = (await res.json()) as { anime: RawAnime[] };
  const wanted = new Set(ids);
  const found = new Map<number, AnimeTheme[]>();
  for (const anime of data.anime) {
    for (const r of anime.resources) {
      if (r.site === "AniList" && wanted.has(r.external_id)) found.set(r.external_id, toThemes(anime, r.external_id));
    }
  }
  return found;
}

/** Themes for each AniList ID, by ID; anime AnimeThemes doesn't know get an empty list */
export async function getThemes(anilistIds: number[]): Promise<Map<number, AnimeTheme[]>> {
  const now = Date.now();
  const unique = Array.from(new Set(anilistIds));
  const result = new Map<number, AnimeTheme[]>();
  const missing: number[] = [];
  for (const id of unique) {
    const hit = cache.get(id);
    if (hit && hit.expires > now) result.set(id, hit.themes);
    else missing.push(id);
  }
  for (let i = 0; i < missing.length; i += CHUNK) {
    const chunk = missing.slice(i, i + CHUNK);
    const found = await fetchChunk(chunk);
    for (const id of chunk) {
      const themes = found.get(id) ?? [];
      cache.set(id, { themes, expires: now + TTL_MS });
      result.set(id, themes);
    }
  }
  if (cache.size > MAX_CACHE) cache.clear();
  return result;
}
