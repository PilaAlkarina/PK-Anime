import { useEffect, useSyncExternalStore } from "react";
import type { CatalogItem } from "@/lib/anilist/types";

/**
 * Current catalog cards for the anime on this device's lists and history, which keep the copy
 * saved when they were added. A show still airing has more episodes out by now, and the card
 * says which one aired last (`airedEpisode`). Kept in memory and refetched after ten minutes.
 */

const MAX_AGE_MS = 10 * 60 * 1000;
const MAX_IDS = 200;

const listeners = new Set<() => void>();
let cards = new Map<number, CatalogItem>();
const fetchedAt = new Map<number, number>();
let inFlight = false;

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

async function load(ids: number[]) {
  const now = Date.now();
  const stale = ids.filter((id) => now - (fetchedAt.get(id) ?? 0) > MAX_AGE_MS).slice(0, MAX_IDS);
  if (stale.length === 0 || inFlight) return;
  inFlight = true;
  // Asked for even when the request fails, so a dead AniList isn't retried on every render
  stale.forEach((id) => fetchedAt.set(id, now));
  try {
    const res = await fetch(`/api/catalog/cards?ids=${stale.join(",")}`);
    const data = await res.json();
    if (!data.success) return;
    const next = new Map(cards);
    for (const card of data.cards as CatalogItem[]) next.set(card.id, card);
    cards = next;
    listeners.forEach((l) => l());
  } catch {
    // The saved copies keep working
  } finally {
    inFlight = false;
  }
}

/** Fresh cards for these IDs, by ID; empty until they arrive */
export function useFreshCards(ids: number[]) {
  const key = Array.from(new Set(ids)).sort((a, b) => a - b).join(",");
  useEffect(() => {
    if (key) load(key.split(",").map(Number));
  }, [key]);
  return useSyncExternalStore(subscribe, () => cards, () => cards);
}

/** The fresh card when there is one, keeping the saved one otherwise */
export const freshen = (fresh: Map<number, CatalogItem>, anime: CatalogItem) => fresh.get(anime.id) ?? anime;
