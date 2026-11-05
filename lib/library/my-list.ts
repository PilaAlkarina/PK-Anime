import type { CatalogItem } from "@/lib/anilist/types";
import type { EntryChanges, ListStatus, TrackerEntry } from "@/lib/trackers/types";
import { catalogSnapshot, watchedEpisodes, type HistoryEntry } from "./history";
import { createStore, readJSON, writeJSON } from "./storage";

/**
 * "Mi lista" on this device, kept like a list service's: every anime has a status, the
 * episodes watched and an optional score. It works without signing in, and import and export
 * move entries between it and MyAnimeList or AniList.
 */
export interface LocalEntry extends TrackerEntry {
  anime: CatalogItem;
}

const KEY = "pk_library_entries";
// Earlier versions kept a plain list of saved series here; it's read once to fill the entries
const LEGACY_LIST_KEY = "pk_library_my_list";
const HISTORY_KEY = "pk_library_history";

function toEntry(anime: CatalogItem, fields: Partial<TrackerEntry>): LocalEntry {
  return {
    anime: catalogSnapshot(anime),
    anilistId: anime.id,
    malId: anime.malId,
    status: fields.status ?? "planning",
    progress: fields.progress ?? 0,
    score: fields.score ?? null,
    rewatching: fields.rewatching ?? false,
    updatedAt: fields.updatedAt ?? Date.now(),
    finishedAt: fields.finishedAt ?? null,
  };
}

/** Today as "YYYY-MM-DD", in local time: the day an anime was finished */
const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

/** Status for `progress` episodes watched out of `total` (null when unknown) */
function statusForProgress(progress: number, total: number | null | undefined): ListStatus {
  return total && progress >= total ? "completed" : "watching";
}

/**
 * First run with entries: the saved series become planned, and what the watch history shows
 * as watched becomes watching (or completed). Order follows the old list, newest first.
 */
function migrate(): LocalEntry[] {
  const now = Date.now();
  const byId = new Map<number, LocalEntry>();
  readJSON<CatalogItem[]>(LEGACY_LIST_KEY, []).forEach((anime, i) => {
    byId.set(anime.id, toEntry(anime, { updatedAt: now - i }));
  });
  for (const item of readJSON<HistoryEntry[]>(HISTORY_KEY, [])) {
    const progress = watchedEpisodes(item);
    if (progress <= 0) continue;
    const status = statusForProgress(progress, item.anime.episodes);
    byId.set(item.anime.id, toEntry(item.anime, { ...byId.get(item.anime.id), status, progress, updatedAt: item.updatedAt }));
  }
  return Array.from(byId.values()).sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0));
}

const store = createStore<LocalEntry[]>(KEY, [], (stored) => {
  if (Array.isArray(stored)) return stored as LocalEntry[];
  // Saved right away, so later history changes don't re-run it
  const migrated = migrate();
  writeJSON(KEY, migrated);
  return migrated;
});

export const useMyList = store.useValue;
export const getMyList = store.get;

export function findLocalEntry(list: LocalEntry[], anime: Pick<CatalogItem, "id">) {
  return list.find((e) => e.anime.id === anime.id) ?? null;
}

export function isInMyList(list: LocalEntry[], animeId: number) {
  return list.some((e) => e.anime.id === animeId);
}

/** Puts the entry first, so "Recientes" shows the latest change on top */
function put(entry: LocalEntry) {
  store.set([entry, ...store.get().filter((e) => e.anime.id !== entry.anime.id)]);
}

/** Adds the anime as planned, or takes it off the list */
export function toggleMyList(anime: CatalogItem) {
  if (isInMyList(store.get(), anime.id)) removeLocalEntry(anime.id);
  else put(toEntry(anime, {}));
}

export function removeLocalEntry(animeId: number) {
  store.set(store.get().filter((e) => e.anime.id !== animeId));
}

/** Sets status, score or progress by hand, adding the anime when it isn't listed */
export function updateLocalEntry(anime: CatalogItem, { status, score, progress }: EntryChanges) {
  const current = findLocalEntry(store.get(), anime);
  const next = toEntry(anime, { ...current, updatedAt: Date.now() });
  if (status) next.status = status;
  if (score !== undefined) next.score = score;
  if (progress !== undefined) next.progress = progress;
  // As on the list services, completed means every episode watched
  if (status === "completed" && anime.episodes) next.progress = Math.max(next.progress, anime.episodes);
  if (status && status !== "watching") next.rewatching = false;
  // Finished today when it becomes completed here; a list service's own date is kept otherwise
  if (next.status === "completed" && current?.status !== "completed") next.finishedAt = today();
  put(next);
  return next;
}

/** Keeps a copy of an entry saved on the list service, so this device matches it */
export function mirrorRemoteEntry(anime: CatalogItem, entry: TrackerEntry) {
  put(toEntry(anime, { ...entry, updatedAt: entry.updatedAt ?? Date.now() }));
}

/** An episode watched in the player; like the services, progress never goes down */
export function saveLocalProgress(anime: CatalogItem, episode: number) {
  const current = findLocalEntry(store.get(), anime);
  if (current && current.progress >= episode) return;
  const status = statusForProgress(episode, anime.episodes);
  const finishedAt = status === "completed" && current?.status !== "completed" ? today() : current?.finishedAt;
  put(toEntry(anime, { ...current, progress: episode, status, finishedAt, updatedAt: Date.now() }));
}

/** Writes several entries at once (an import), keeping each one's own update time */
export function saveLocalEntries(entries: LocalEntry[]) {
  if (entries.length === 0) return;
  const ids = new Set(entries.map((e) => e.anime.id));
  const merged = [...entries, ...store.get().filter((e) => !ids.has(e.anime.id))];
  store.set(merged.sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0)));
}

export { toEntry as localEntry };
