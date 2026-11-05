import { useEffect, useSyncExternalStore } from "react";
import type { CatalogItem } from "@/lib/anilist/types";
import type { ListStatus, TrackerEntry, TrackerId } from "@/lib/trackers/types";
import { useAccount } from "./account";
import { episodeProgress, type ContinueItem } from "./history";
import type { LocalEntry } from "./my-list";

/**
 * The signed-in user's remote list (MyAnimeList or AniList), fetched from /api/tracker/library and
 * shared by every screen. Kept in memory only: it's refetched when a screen opens and the
 * copy is more than a minute old.
 */
export interface RemoteLibrary {
  provider: { id: TrackerId; name: string };
  entries: TrackerEntry[];
  /** Catalog cards for the entries AniList knows, by AniList ID */
  anime: Map<number, CatalogItem>;
  byAnilistId: Map<number, TrackerEntry>;
  byMalId: Map<number, TrackerEntry>;
  fetchedAt: number;
}

// The whole list is several requests to the service, and this app's own writes are merged in as
// they happen (upsertRemoteEntry), so a copy only goes stale through other devices: refetched
// after ten minutes, or after one when coming back to the tab
const MAX_AGE_MS = 10 * 60_000;
const FOCUS_MAX_AGE_MS = 60_000;

export const REMOTE_STATUS_LABELS: Record<ListStatus, string> = {
  watching: "Viendo",
  planning: "Pendiente",
  completed: "Completado",
  paused: "En pausa",
  dropped: "Abandonado",
};

const SHORT_NAMES: Record<TrackerId, string> = { myanimelist: "MAL", anilist: "AniList" };
export const providerShortName = (id: TrackerId) => SHORT_NAMES[id] ?? id;

const listeners = new Set<() => void>();
let library: RemoteLibrary | null = null;
let inFlight: Promise<void> | null = null;

function set(next: RemoteLibrary | null) {
  library = next;
  listeners.forEach((l) => l());
}

/** `fetchedAt` stays the download's time when merging a local write, so the copy can still age */
function build(
  provider: RemoteLibrary["provider"],
  entries: TrackerEntry[],
  anime: CatalogItem[],
  fetchedAt = Date.now()
): RemoteLibrary {
  const byAnilistId = new Map<number, TrackerEntry>();
  const byMalId = new Map<number, TrackerEntry>();
  for (const entry of entries) {
    if (entry.anilistId) byAnilistId.set(entry.anilistId, entry);
    if (entry.malId) byMalId.set(entry.malId, entry);
  }
  return {
    provider,
    entries,
    anime: new Map(anime.map((a) => [a.id, a])),
    byAnilistId,
    byMalId,
    fetchedAt,
  };
}

let focusListening = false;

/** Back on the tab after a while: the list may have changed on another device */
function refreshOnReturn() {
  if (focusListening || typeof document === "undefined") return;
  focusListening = true;
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && library && Date.now() - library.fetchedAt > FOCUS_MAX_AGE_MS) {
      refreshRemoteLibrary();
    }
  });
}

export function refreshRemoteLibrary() {
  inFlight ??= fetch("/api/tracker/library", { cache: "no-store" })
    .then(async (res) => {
      const data = await res.json().catch(() => null);
      if (res.status === 401) set(null);
      else if (data?.success) set(build(data.provider, data.entries, data.anime));
    })
    .catch(() => {})
    .finally(() => {
      inFlight = null;
    });
  return inFlight;
}

/** Records a write (progress, added as planned) without refetching the whole list */
export function upsertRemoteEntry(entry: TrackerEntry, card?: CatalogItem) {
  if (!library) return;
  const matches = (e: TrackerEntry) =>
    (!!entry.malId && e.malId === entry.malId) || (!!entry.anilistId && e.anilistId === entry.anilistId);
  const merged = { ...entry, anilistId: entry.anilistId ?? card?.id ?? null };
  const entries = [merged, ...library.entries.filter((e) => !matches(e))];
  const anime = Array.from(library.anime.values());
  if (card && !library.anime.has(card.id)) anime.push(card);
  set(build(library.provider, entries, anime, library.fetchedAt));
}

/** Records a removal from the remote list without refetching it */
export function removeRemoteEntry(anime: Pick<CatalogItem, "id" | "malId">) {
  if (!library) return;
  const entries = library.entries.filter(
    (e) => e.anilistId !== anime.id && !(anime.malId && e.malId === anime.malId)
  );
  set(build(library.provider, entries, Array.from(library.anime.values()), library.fetchedAt));
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

/** The remote list while signed in, null otherwise (and until it first arrives) */
export function useRemoteLibrary() {
  const account = useAccount();
  const value = useSyncExternalStore(subscribe, () => library, () => null);
  const signedIn = account?.signedIn;

  useEffect(() => {
    refreshOnReturn();
    if (signedIn === false && library) set(null);
    if (signedIn && (!library || Date.now() - library.fetchedAt > MAX_AGE_MS)) refreshRemoteLibrary();
  }, [signedIn]);

  return signedIn ? value : null;
}

export function findRemoteEntry(remote: RemoteLibrary | null, anime: Pick<CatalogItem, "id" | "malId">) {
  if (!remote) return null;
  return remote.byAnilistId.get(anime.id) ?? (anime.malId ? remote.byMalId.get(anime.malId) : undefined) ?? null;
}

/** Next episode to watch for a remote entry being watched, or null when caught up */
export function remoteNextEpisode(entry: TrackerEntry | null, anime: Pick<CatalogItem, "availableEpisodes" | "episodes">) {
  if (!entry || (entry.status !== "watching" && entry.status !== "paused" && !entry.rewatching)) return null;
  const next = entry.progress + 1;
  const available = anime.availableEpisodes ?? anime.episodes;
  return available && next > available ? null : next;
}

const isActive = (entry: TrackerEntry) => entry.status === "watching" || entry.rewatching;

/**
 * "Seguir viendo" from every source: the watch history, plus what this device's list and the
 * remote list are watching (an imported entry has no history yet). When several have the same
 * anime, the furthest episode wins.
 *
 * Only anime being watched or rewatched: one on a list with another status (paused, planning,
 * completed, dropped) stays out even with history. The remote entry decides when there are both;
 * history of an anime on no list counts as watching.
 */
export function mergeContinueWatching(
  history: ContinueItem[],
  remote: RemoteLibrary | null,
  local: LocalEntry[] = [],
  /** Swaps a saved card for a current one (see fresh-cards) */
  refresh: (anime: CatalogItem) => CatalogItem = (anime) => anime
): ContinueItem[] {
  const localById = new Map(local.map((entry) => [entry.anime.id, entry]));
  const listEntry = (anime: Pick<CatalogItem, "id" | "malId">) => findRemoteEntry(remote, anime) ?? localById.get(anime.id) ?? null;

  const byId = new Map(
    history
      .filter((item) => {
        const entry = listEntry(item.anime);
        return !entry || isActive(entry);
      })
      .map((item) => [item.anime.id, { ...item }])
  );
  const consider = (saved: CatalogItem | undefined, entry: TrackerEntry) => {
    const anime = saved && refresh(saved);
    // Both this entry and the one that decides (a local entry the remote list has paused doesn't count)
    const decider = anime ? listEntry(anime) : null;
    if (!anime || !isActive(entry) || !decider || !isActive(decider)) return;
    const next = remoteNextEpisode(entry, anime);
    if (!next) return;
    const existing = byId.get(anime.id);
    if (existing && existing.episode >= next) {
      existing.updatedAt = Math.max(existing.updatedAt, entry.updatedAt ?? 0);
      return;
    }
    byId.set(anime.id, {
      anime: existing?.anime ?? anime,
      episode: next,
      progress: episodeProgress(anime.id, next),
      updatedAt: Math.max(existing?.updatedAt ?? 0, entry.updatedAt ?? 0),
    });
  };
  for (const entry of local) consider(entry.anime, entry);
  for (const entry of remote?.entries ?? []) consider(entry.anilistId ? remote!.anime.get(entry.anilistId) : undefined, entry);
  return Array.from(byId.values()).sort((a, b) => b.updatedAt - a.updatedAt);
}

export type ListOrigin = "local" | "remote" | "both";

export interface MyListItem {
  item: CatalogItem;
  origin: ListOrigin;
  /** The remote entry when the anime is on the remote list (it's the one being edited), the local one otherwise */
  entry: TrackerEntry | null;
}

/**
 * "Mi lista" from both sides: this device's list plus the whole remote list, most recently
 * updated first. `local` items exist only on this device and can be exported.
 */
export function mergeMyList(local: LocalEntry[], remote: RemoteLibrary | null): MyListItem[] {
  const items: (MyListItem & { updatedAt: number })[] = local.map((entry) => {
    const remoteEntry = findRemoteEntry(remote, entry.anime);
    return {
      // The service's card is current; the one saved here is from when it was added
      item: remote?.anime.get(entry.anime.id) ?? entry.anime,
      origin: remote ? (remoteEntry ? "both" : "local") : "local",
      entry: remoteEntry ?? entry,
      updatedAt: Math.max(entry.updatedAt ?? 0, remoteEntry?.updatedAt ?? 0),
    };
  });
  if (remote) {
    const localIds = new Set(local.map((e) => e.anime.id));
    for (const entry of remote.entries) {
      const anime = entry.anilistId && !localIds.has(entry.anilistId) ? remote.anime.get(entry.anilistId) : undefined;
      if (anime) items.push({ item: anime, origin: "remote", entry, updatedAt: entry.updatedAt ?? 0 });
    }
  }
  return items.sort((a, b) => b.updatedAt - a.updatedAt).map(({ updatedAt: _, ...item }) => item);
}