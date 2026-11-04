import type { AnimeDetail } from "./types";

export interface EpisodeInfo {
  title: string;
  thumbnail: string | null;
}

/**
 * Episode titles and thumbnails. ani.zip comes first (TVDB artwork, numbered like the AniList
 * entry); AniList's streaming links ("Episode 3 - Title") fill whatever it lacks.
 */
export function episodeInfo(anime: AnimeDetail): Map<number, EpisodeInfo> {
  const info = new Map<number, EpisodeInfo>();
  for (const ep of anime.streamingEpisodes) {
    const match = ep.title.match(/^Episode\s+(\d+)\s*[-–:]?\s*(.*)$/i);
    if (match) info.set(Number(match[1]), { title: match[2].trim(), thumbnail: ep.thumbnail });
  }
  // Details cached before ani.zip was added have no episodeDetails
  for (const ep of anime.episodeDetails ?? []) {
    const fallback = info.get(ep.number);
    info.set(ep.number, {
      title: ep.title || fallback?.title || "",
      thumbnail: ep.thumbnail || fallback?.thumbnail || null,
    });
  }
  return info;
}
