import type { ListStatus } from "@/lib/trackers/types";
import { formatLabel } from "./format";
import type { MyListItem } from "./remote";
import { createStore } from "./storage";

/**
 * How "Mi lista" is filtered and sorted. Remembered per device, so the list opens the way it
 * was left.
 */

export type StatusFilter = "all" | ListStatus | "local";
export type ScoreFilter = "any" | "9-10" | "7-8" | "5-6" | "1-4" | "none";
export type ListSort = "recent" | "score" | "average" | "title" | "year";

export interface ListView {
  status: StatusFilter;
  score: ScoreFilter;
  /** AniList format (TV, MOVIE…) or "any" */
  format: string;
  sort: ListSort;
}

const DEFAULT_VIEW: ListView = { status: "all", score: "any", format: "any", sort: "recent" };

const store = createStore<ListView>("pk_my_list_view", DEFAULT_VIEW, (stored) => ({
  ...DEFAULT_VIEW,
  ...(stored && typeof stored === "object" ? (stored as Partial<ListView>) : {}),
}));

export const useListView = store.useValue;
export const updateListView = (changes: Partial<ListView>) => store.set({ ...store.get(), ...changes });

export const STATUS_FILTERS: StatusFilter[] = ["all", "watching", "planning", "completed", "paused", "dropped", "local"];

export const SCORE_FILTERS: { value: ScoreFilter; label: string }[] = [
  { value: "any", label: "Cualquier nota" },
  { value: "9-10", label: "9–10" },
  { value: "7-8", label: "7–8" },
  { value: "5-6", label: "5–6" },
  { value: "1-4", label: "1–4" },
  { value: "none", label: "Sin nota" },
];

export const LIST_SORTS: { value: ListSort; label: string }[] = [
  { value: "recent", label: "Recientes" },
  { value: "score", label: "Tu nota" },
  { value: "average", label: "Nota media" },
  { value: "title", label: "Título" },
  { value: "year", label: "Año" },
];

export function matchesStatus({ origin, entry }: MyListItem, filter: StatusFilter) {
  if (filter === "all") return true;
  if (filter === "local") return origin === "local";
  return entry?.status === filter;
}

export function matchesScore({ entry }: MyListItem, filter: ScoreFilter) {
  const score = entry?.score ?? 0;
  switch (filter) {
    case "any":
      return true;
    case "none":
      return !score;
    default: {
      const [min, max] = filter.split("-").map(Number);
      return score >= min && score <= max;
    }
  }
}

export function matchesFormat({ item }: MyListItem, format: string) {
  return format === "any" || item.format === format;
}

/** Formats present in the list, for the format filter */
export function listFormats(items: MyListItem[]) {
  const formats = new Map<string, number>();
  for (const { item } of items) if (item.format) formats.set(item.format, (formats.get(item.format) ?? 0) + 1);
  return Array.from(formats, ([value, count]) => ({ value, label: formatLabel(value) ?? value, count })).sort(
    (a, b) => b.count - a.count
  );
}

const collator = new Intl.Collator("es", { sensitivity: "base", numeric: true });

// Missing values go last whatever the direction
function desc(a: number | null | undefined, b: number | null | undefined) {
  if (a == null || b == null) return a == null ? (b == null ? 0 : 1) : -1;
  return b - a;
}

/**
 * Sorted copy. "Recientes" keeps the merged order (local items first, then the remote list by
 * last update); the others fall back to it on ties.
 */
export function sortList(items: MyListItem[], sort: ListSort) {
  const indexed = items.map((item, index) => ({ item, index }));
  const compare = (a: MyListItem, b: MyListItem) => {
    switch (sort) {
      case "score":
        return desc(a.entry?.score || null, b.entry?.score || null);
      case "average":
        return desc(a.item.score, b.item.score);
      case "title":
        return collator.compare(a.item.title, b.item.title);
      case "year":
        return desc(a.item.seasonYear, b.item.seasonYear);
      default:
        return 0;
    }
  };
  return indexed.sort((a, b) => compare(a.item, b.item) || a.index - b.index).map(({ item }) => item);
}
