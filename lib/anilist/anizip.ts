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
      }))
      .sort((a, b) => a.number - b.number);
  },
  ["anizip:episodes"],
  { revalidate: TTL }
);
