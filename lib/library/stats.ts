import type { CatalogItem } from "@/lib/anilist/types";
import type { ListStatus, TrackerEntry } from "@/lib/trackers/types";
import { formatLabel } from "./format";
import type { MyListItem } from "./remote";

/** AniList has the real length only on the anime page; lists keep cards, so these stand in */
const EPISODE_MINUTES = 24;
const MOVIE_MINUTES = 100;

export const STATUS_ORDER: ListStatus[] = ["completed", "watching", "paused", "planning", "dropped"];

/**
 * Fixed colors for the status chart (MyAnimeList's own scheme). Not theme classes: some themes
 * turn the "red" utility into their accent.
 */
export const STATUS_HEX: Record<ListStatus, string> = {
  completed: "#60a5fa",
  watching: "#34d399",
  paused: "#fbbf24",
  planning: "#94a3b8",
  dropped: "#f87171",
};

export type StatsPeriod = "all" | number;

export interface ListStats {
  total: number;
  byStatus: Record<ListStatus, number>;
  completed: number;
  episodes: number;
  /** Approximate, from EPISODE_MINUTES and MOVIE_MINUTES */
  hours: number;
  /** Count per score, index 1–10 */
  scores: number[];
  scored: number;
  meanScore: number | null;
  /** Most watched genres, weighted by episodes watched */
  genres: { name: string; episodes: number }[];
  formats: { label: string; count: number }[];
  /** Anime completed per year (all time) or per month (one year) */
  timeline: { label: string; count: number }[];
  /** Completed in the period, best scored first */
  favorites: { item: CatalogItem; score: number | null }[];
}

/**
 * The year an entry belongs to: when it was finished if the list says so (completed ones), the
 * last change otherwise
 */
function entryDate(entry: TrackerEntry): { year: number; month: number } | null {
  if (entry.status === "completed" && entry.finishedAt) {
    const [year, month] = entry.finishedAt.split("-").map(Number);
    if (year) return { year, month: month ? month - 1 : -1 };
  }
  if (!entry.updatedAt) return null;
  const d = new Date(entry.updatedAt);
  return { year: d.getFullYear(), month: d.getMonth() };
}

/** Years with any activity, newest first, for the period picker */
export function statsYears(items: MyListItem[]): number[] {
  const years = new Set<number>();
  for (const { entry } of items) {
    const date = entry && entryDate(entry);
    if (date) years.add(date.year);
  }
  return Array.from(years).sort((a, b) => b - a);
}

const MONTHS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

const minutesFor = (item: CatalogItem, progress: number) =>
  item.format === "MOVIE" ? Math.min(progress, 1) * MOVIE_MINUTES : progress * EPISODE_MINUTES;

/**
 * Numbers for the stats page, from "Mi lista" merged with the remote list. With a year, only the
 * anime finished that year, or changed that year when they aren't completed.
 */
export function listStats(items: MyListItem[], period: StatsPeriod = "all"): ListStats {
  const byStatus: Record<ListStatus, number> = { watching: 0, planning: 0, completed: 0, paused: 0, dropped: 0 };
  const scores = Array(11).fill(0) as number[];
  const genres = new Map<string, number>();
  const formats = new Map<string, number>();
  const perYear = new Map<number, number>();
  const perMonth = Array(12).fill(0) as number[];
  const favorites: { item: CatalogItem; score: number | null; at: number }[] = [];
  let total = 0;
  let episodes = 0;
  let minutes = 0;
  let scoreSum = 0;
  let scored = 0;

  for (const { item, entry } of items) {
    if (!entry) continue;
    const date = entryDate(entry);
    if (period !== "all" && date?.year !== period) continue;
    total++;
    byStatus[entry.status]++;
    episodes += entry.progress;
    minutes += minutesFor(item, entry.progress);
    if (entry.score) {
      scores[entry.score]++;
      scoreSum += entry.score;
      scored++;
    }
    for (const genre of item.genres) genres.set(genre, (genres.get(genre) ?? 0) + entry.progress);
    const format = formatLabel(item.format) || "Otro";
    formats.set(format, (formats.get(format) ?? 0) + 1);
    if (entry.status === "completed") {
      favorites.push({ item, score: entry.score, at: entry.updatedAt ?? 0 });
      if (date) {
        perYear.set(date.year, (perYear.get(date.year) ?? 0) + 1);
        if (date.month >= 0) perMonth[date.month]++;
      }
    }
  }

  let timeline: { label: string; count: number }[];
  if (period === "all") {
    const years = Array.from(perYear.keys()).sort((a, b) => a - b);
    timeline = [];
    // Every year in between, so a gap shows as an empty bar
    for (let y = years[0]; years.length && y <= years[years.length - 1]; y++) {
      timeline.push({ label: String(y), count: perYear.get(y) ?? 0 });
    }
  } else {
    timeline = MONTHS.map((label, i) => ({ label, count: perMonth[i] }));
  }

  return {
    total,
    byStatus,
    completed: byStatus.completed,
    episodes,
    hours: Math.round(minutes / 60),
    scores,
    scored,
    meanScore: scored ? Math.round((scoreSum / scored) * 10) / 10 : null,
    genres: Array.from(genres, ([name, eps]) => ({ name, episodes: eps }))
      .filter((g) => g.episodes > 0)
      .sort((a, b) => b.episodes - a.episodes)
      .slice(0, 8),
    formats: Array.from(formats, ([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count),
    timeline,
    favorites: favorites
      .sort((a, b) => (b.score ?? 0) - (a.score ?? 0) || b.at - a.at)
      .map(({ item, score }) => ({ item, score })),
  };
}
