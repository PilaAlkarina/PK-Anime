import type { AnimeDetail } from "./types";

export interface EpisodeInfo {
  title: string;
  thumbnail: string | null;
}

/** Episode titles and thumbnails, from AniList's streaming links ("Episode 3 - Title") */
export function episodeInfo(anime: AnimeDetail): Map<number, EpisodeInfo> {
  const info = new Map<number, EpisodeInfo>();
  for (const ep of anime.streamingEpisodes) {
    const match = ep.title.match(/^Episode\s+(\d+)\s*[-–:]?\s*(.*)$/i);
    if (match) info.set(Number(match[1]), { title: match[2].trim(), thumbnail: ep.thumbnail });
  }
  return info;
}
