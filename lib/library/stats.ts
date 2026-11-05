import type { CatalogItem } from "@/lib/anilist/types";
import type { ListStatus } from "@/lib/trackers/types";
import type { MyListItem } from "./remote";

/** AniList has the real length only on the anime page; lists keep cards, so these stand in */
const EPISODE_MINUTES = 24;
const MOVIE_MINUTES = 100;

export interface ListStats {
  total: number;
  byStatus: Record<ListStatus, number>;
  episodes: number;
  /** Approximate, from EPISODE_MINUTES and MOVIE_MINUTES */
  hours: number;
  /** Count per score, index 1–10 */
  scores: number[];
  scored: number;
  meanScore: number | null;
  /** Most watched genres, weighted by episodes watched */
  genres: { name: string; episodes: number }[];
  year: {
    year: number;
    completed: number;
    episodes: number;
    /** Completed this year, best scored first */
    favorites: { item: CatalogItem; score: number | null }[];
  };
}

const minutesFor = (item: CatalogItem, progress: number) =>
  item.format === "MOVIE" ? Math.min(progress, 1) * MOVIE_MINUTES : progress * EPISODE_MINUTES;

/** Numbers for the stats page, from "Mi lista" merged with the remote list */
export function listStats(items: MyListItem[], now = new Date()): ListStats {
  const byStatus: Record<ListStatus, number> = { watching: 0, planning: 0, completed: 0, paused: 0, dropped: 0 };
  const scores = Array(11).fill(0) as number[];
  const genres = new Map<string, number>();
  let episodes = 0;
  let minutes = 0;
  let scoreSum = 0;
  let scored = 0;
  const year = now.getFullYear();
  const yearStart = new Date(year, 0, 1).getTime();
  const yearFavorites: { item: CatalogItem; score: number | null; at: number }[] = [];
  let yearEpisodes = 0;

  for (const { item, entry } of items) {
    if (!entry) continue;
    byStatus[entry.status]++;
    episodes += entry.progress;
    minutes += minutesFor(item, entry.progress);
    if (entry.score) {
      scores[entry.score]++;
      scoreSum += entry.score;
      scored++;
    }
    for (const genre of item.genres) genres.set(genre, (genres.get(genre) ?? 0) + entry.progress);
    if ((entry.updatedAt ?? 0) >= yearStart && entry.status === "completed") {
      yearFavorites.push({ item, score: entry.score, at: entry.updatedAt ?? 0 });
      yearEpisodes += entry.progress;
    }
  }

  return {
    total: items.length,
    byStatus,
    episodes,
    hours: Math.round(minutes / 60),
    scores,
    scored,
    meanScore: scored ? Math.round((scoreSum / scored) * 10) / 10 : null,
    genres: Array.from(genres, ([name, eps]) => ({ name, episodes: eps }))
      .filter((g) => g.episodes > 0)
      .sort((a, b) => b.episodes - a.episodes)
      .slice(0, 8),
    year: {
      year,
      completed: yearFavorites.length,
      episodes: yearEpisodes,
      favorites: yearFavorites
        .sort((a, b) => (b.score ?? 0) - (a.score ?? 0) || b.at - a.at)
        .map(({ item, score }) => ({ item, score })),
    },
  };
}
