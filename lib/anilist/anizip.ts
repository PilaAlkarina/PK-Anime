import { unstable_cache } from "next/cache";
import type { EpisodeDetail } from "./types";

/**
 * Episode titles and thumbnails from ani.zip, a free mapping API keyed by AniList ID. Its images
 * are TVDB screencaps, which cover far more series than AniList's streaming links (Crunchyroll
 * only), and its episodes are numbered like the AniList entry, also for later seasons that the
 * streaming sites number on from the first one.
 */

const TTL = 12 * 60 * 60;
const TIMEOUT_MS = 4000;

interface RawEpisode {
  title?: Record<string, string | null> | null;
  image?: string | null;
  airDateUtc?: string | null;
  /** TVDB's air day, and AniDB's (more often there for airing series) */
  airDate?: string | null;
  airdate?: string | null;
  runtime?: number | null;
}

// A failure isn't cached by unstable_cache (it throws), so it's remembered here for a while:
// otherwise every page render while ani.zip is down would wait out the timeout again
const FAILURE_MS = 10 * 60 * 1000;
const failedUntil = new Map<number, number>();

/** ani.zip's episodes, or none while it's failing for this anime (retried after ten minutes) */
export async function aniZipEpisodesOrNone(anilistId: number): Promise<EpisodeDetail[]> {
  if ((failedUntil.get(anilistId) ?? 0) > Date.now()) return [];
  try {
    const episodes = await getAniZipEpisodes(anilistId);
    failedUntil.delete(anilistId);
    return episodes;
  } catch {
    failedUntil.set(anilistId, Date.now() + FAILURE_MS);
    return [];
  }
}

/** Throws when ani.zip can't be reached, so a failure isn't cached for the whole TTL */
export const getAniZipEpisodes = unstable_cache(
  async (anilistId: number): Promise<EpisodeDetail[]> => {
    const res = await fetch(`https://api.ani.zip/mappings?anilist_id=${anilistId}`, {
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (res.status === 404) return [];
    if (!res.ok) throw new Error(`ani.zip ${res.status}`);
    const data = (await res.json()) as { episodes?: Record<string, RawEpisode> | null };

    // Keys are the episode numbers; specials come as "S1", "C1"… and are left out
    return Object.entries(data.episodes || {})
      .filter(([key]) => /^\d+$/.test(key))
      .map(([key, ep]) => ({
        number: Number(key),
        title: ep.title?.en || ep.title?.["x-jat"] || null,
        thumbnail: ep.image || null,
        airDateUtc: ep.airDateUtc || null,
        airDay: ep.airDate || ep.airdate || null,
        // TVDB's runtime; AniDB's length is rounded up (25 for a 24-minute episode)
        duration: ep.runtime || null,
      }))
      .sort((a, b) => a.number - b.number);
  },
  // v3: air dates and durations
  ["anizip:episodes:v3"],
  { revalidate: TTL }
);
