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
export const WATCHED_FRACTION = 0.9;

const store = createStore<HistoryEntry[]>("pk_library_history", []);

/** Only the card fields, so a full AnimeDetail doesn't bloat localStorage */
export function catalogSnapshot(item: CatalogItem): CatalogItem {
  return {
    id: item.id,
    malId: item.malId,
    title: item.title,
    romajiTitle: item.romajiTitle,
    cover: item.cover,
    color: item.color,
    banner: item.banner,
    format: item.format,
    status: item.status,
    episodes: item.episodes,
    availableEpisodes: item.availableEpisodes,
    score: item.score,
    season: item.season,
    seasonYear: item.seasonYear,
    genres: item.genres,
    nextEpisode: item.nextEpisode,
  };
}

export const useWatchHistory = store.useValue;
export const getWatchHistory = store.get;

/** Adds history from elsewhere (a phone's profile): per anime, the latest one wins */
export function mergeHistory(entries: HistoryEntry[]) {
  const byId = new Map(store.get().map((e) => [e.anime.id, e]));
  for (const entry of entries) {
    const current = byId.get(entry.anime.id);
    if (!current || entry.updatedAt > current.updatedAt) byId.set(entry.anime.id, entry);
  }
  store.set(Array.from(byId.values()).sort((a, b) => b.updatedAt - a.updatedAt).slice(0, MAX_ENTRIES));
}

export function recordWatch(anime: CatalogItem, episode: number) {
  const others = store.get().filter((e) => e.anime.id !== anime.id);
  store.set([{ anime: catalogSnapshot(anime), episode, updatedAt: Date.now() }, ...others].slice(0, MAX_ENTRIES));
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
  /** Unix ms of the last activity, for ordering */
  updatedAt: number;
}

/** Episodes fully watched, judging by the last one opened and how far it got */
export function watchedEpisodes({ anime, episode }: HistoryEntry) {
  return episodeProgress(anime.id, episode) >= WATCHED_FRACTION ? episode : episode - 1;
}

/** The episode to resume per anime: the last one opened, or the next one once it was finished */
export function continueWatching(entries: HistoryEntry[]): ContinueItem[] {
  const items: ContinueItem[] = [];
  for (const { anime, episode, updatedAt } of entries) {
    const progress = episodeProgress(anime.id, episode);
    if (progress < WATCHED_FRACTION) {
      items.push({ anime, episode, progress, updatedAt });
      continue;
    }
    const lastAvailable = anime.availableEpisodes ?? anime.episodes ?? episode;
    if (episode < lastAvailable) items.push({ anime, episode: episode + 1, progress: 0, updatedAt });
  }
  return items;
}
