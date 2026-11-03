import { useEffect, useSyncExternalStore } from "react";
import type { CatalogItem } from "@/lib/anilist/types";
import type { ListStatus, TrackerEntry, TrackerId } from "@/lib/trackers/types";
import { useAccount } from "./account";
import { episodeProgress, type ContinueItem } from "./history";

/**
 * The signed-in user's remote list (MyAnimeList today), fetched from /api/tracker/library and
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

const MAX_AGE_MS = 60_000;

export const REMOTE_STATUS_LABELS: Record<ListStatus, string> = {
  watching: "Viendo",
  planning: "Pendiente",
  completed: "Completado",
  paused: "En pausa",
  dropped: "Abandonado",
};

const SHORT_NAMES: Record<TrackerId, string> = { myanimelist: "MAL" };
export const providerShortName = (id: TrackerId) => SHORT_NAMES[id] ?? id;

const listeners = new Set<() => void>();
let library: RemoteLibrary | null = null;
let inFlight: Promise<void> | null = null;

function set(next: RemoteLibrary | null) {
  library = next;
  listeners.forEach((l) => l());
}

function build(provider: RemoteLibrary["provider"], entries: TrackerEntry[], anime: CatalogItem[]): RemoteLibrary {
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
    fetchedAt: Date.now(),
  };
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
  set(build(library.provider, entries, anime));
}

/** Records a removal from the remote list without refetching it */
export function removeRemoteEntry(anime: Pick<CatalogItem, "id" | "malId">) {
  if (!library) return;
  const entries = library.entries.filter(
    (e) => e.anilistId !== anime.id && !(anime.malId && e.malId === anime.malId)
  );
  set(build(library.provider, entries, Array.from(library.anime.values())));
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

/**
 * "Seguir viendo" from both sides: local history plus what the remote list is watching. When
 * both have the same anime, the furthest episode wins.
 */
export function mergeContinueWatching(local: ContinueItem[], remote: RemoteLibrary | null): ContinueItem[] {
  const byId = new Map(local.map((item) => [item.anime.id, { ...item }]));
  for (const entry of remote?.entries ?? []) {
    const anime = entry.anilistId ? remote!.anime.get(entry.anilistId) : undefined;
    const next = anime ? remoteNextEpisode(entry, anime) : null;
    if (!anime || !next) continue;
    const existing = byId.get(anime.id);
    if (existing && existing.episode >= next) {
      existing.updatedAt = Math.max(existing.updatedAt, entry.updatedAt ?? 0);
      continue;
    }
    byId.set(anime.id, {
      anime: existing?.anime ?? anime,
      episode: next,
      progress: episodeProgress(anime.id, next),
      updatedAt: Math.max(existing?.updatedAt ?? 0, entry.updatedAt ?? 0),
    });
  }
  return Array.from(byId.values()).sort((a, b) => b.updatedAt - a.updatedAt);
}

export type ListOrigin = "local" | "remote" | "both";

export interface MyListItem {
  item: CatalogItem;
  origin: ListOrigin;
  entry: TrackerEntry | null;
}

/**
 * "Mi lista" from both sides: the local list plus the whole remote list, in every status.
 * `local` items exist only on this device and can be exported. Local items come first, then
 * the remote ones, most recently updated first.
 */
export function mergeMyList(local: CatalogItem[], remote: RemoteLibrary | null): MyListItem[] {
  const items: MyListItem[] = local.map((item) => {
    const entry = findRemoteEntry(remote, item);
    return { item, origin: remote ? (entry ? "both" : "local") : "local", entry };
  });
  if (!remote) return items;
  const localIds = new Set(local.map((item) => item.id));
  const others = remote.entries
    .filter((e) => e.anilistId && !localIds.has(e.anilistId))
    .sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0));
  for (const entry of others) {
    const anime = remote.anime.get(entry.anilistId!);
    if (anime) items.push({ item: anime, origin: "remote", entry });
  }
  return items;
}