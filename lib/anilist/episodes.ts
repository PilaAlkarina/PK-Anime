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

export interface UpcomingEpisode {
  number: number;
  title: string | null;
  thumbnail: string | null;
  /** Minutes */
  duration: number | null;
  /** Unix seconds, or null when no source has a date yet */
  airingAt: number | null;
  /** False when only the day is known */
  exactTime: boolean;
}

/** A Japanese air day as a moment inside that same day in Europe and the Americas (noon in Japan) */
const japanNoon = (day: string) => {
  const [y, m, d] = day.split("-").map(Number);
  return y && m && d ? Date.UTC(y, m - 1, d, 3) / 1000 : null;
};

/**
 * Episodes announced but not out yet, after the last available one: as many as the series has,
 * or as AniList's schedule and ani.zip list. The date comes from AniList's schedule (exact time),
 * else from ani.zip (an exact time, or just the day).
 */
export function upcomingEpisodes(anime: AnimeDetail, available: number): UpcomingEpisode[] {
  if (anime.status !== "RELEASING" && anime.status !== "NOT_YET_RELEASED" && anime.status !== "HIATUS") return [];
  const airings = new Map((anime.upcomingAirings ?? []).map((a) => [a.episode, a.airingAt]));
  const details = new Map((anime.episodeDetails ?? []).map((d) => [d.number, d]));
  const info = episodeInfo(anime);

  // ani.zip may list episodes past the announced count; AniList's count, when there is one, wins
  const lastKnown = Math.max(0, ...Array.from(airings.keys()), ...Array.from(details.keys()));
  const last = anime.episodes ?? lastKnown;

  const upcoming: UpcomingEpisode[] = [];
  for (let number = available + 1; number <= last; number++) {
    const detail = details.get(number);
    const exact = airings.get(number) ?? (detail?.airDateUtc ? Date.parse(detail.airDateUtc) / 1000 : null);
    const day = !exact && detail?.airDay ? japanNoon(detail.airDay) : null;
    upcoming.push({
      number,
      title: info.get(number)?.title || null,
      thumbnail: info.get(number)?.thumbnail || null,
      duration: detail?.duration || anime.duration,
      airingAt: exact ?? day,
      exactTime: !!exact,
    });
  }
  return upcoming;
}
