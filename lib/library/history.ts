import type { CatalogItem } from "@/lib/anilist/types";
import { createStore, readJSON } from "./storage";

export interface HistoryEntry {
  anime: CatalogItem;
  /** Last episode opened */
  episode: number;
  updatedAt: number;
}

const MAX_ENTRIES = 50;
// A finished episode moves "Seguir viendo" on to the next one, matching the player's MAL sync
const WATCHED_FRACTION = 0.9;

const store = createStore<HistoryEntry[]>("pk_library_history", []);

export const useWatchHistory = store.useValue;

export function recordWatch(anime: CatalogItem, episode: number) {
  const { airedEpisode, ...snapshot } = anime;
  const others = store.get().filter((e) => e.anime.id !== anime.id);
  store.set([{ anime: snapshot, episode, updatedAt: Date.now() }, ...others].slice(0, MAX_ENTRIES));
}

export function removeFromHistory(animeId: number) {
  store.set(store.get().filter((e) => e.anime.id !== animeId));
}

/** 0–1, read from the progress the player saves for each episode */
export function episodeProgress(animeId: number, episode: number) {
  const saved = readJSON<{ currentTime?: number; duration?: number } | null>(
    `anime_progress:ani:${animeId}:${episode}`,
    null
  );
  if (!saved?.duration || !saved.currentTime) return 0;
  return Math.min(1, saved.currentTime / saved.duration);
}

export interface ContinueItem {
  anime: CatalogItem;
  episode: number;
  progress: number;
}

/** The episode to resume per anime: the last one opened, or the next one once it was finished */
export function continueWatching(entries: HistoryEntry[]): ContinueItem[] {
  const items: ContinueItem[] = [];
  for (const { anime, episode } of entries) {
    const progress = episodeProgress(anime.id, episode);
    if (progress < WATCHED_FRACTION) {
      items.push({ anime, episode, progress });
      continue;
    }
    const lastAvailable = anime.availableEpisodes ?? anime.episodes ?? episode;
    if (episode < lastAvailable) items.push({ anime, episode: episode + 1, progress: 0 });
  }
  return items;
}
