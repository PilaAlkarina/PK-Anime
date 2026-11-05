import { useEffect, useState } from "react";
import type { AnimeDetail, CatalogItem } from "@/lib/anilist/types";
import type { TrackerEntry } from "@/lib/trackers/types";

// Watch orders by AniList ID, kept for the session (every entry of a franchise shares one)
const cache = new Map<number, Promise<CatalogItem[]>>();

function watchOrder(id: number) {
  let found = cache.get(id);
  if (!found) {
    found = fetch(`/api/catalog/franchise/${id}`)
      .then((res) => res.json())
      .then((data) => (data.success ? (data.items as CatalogItem[]) : []))
      .catch(() => {
        cache.delete(id);
        return [];
      });
    cache.set(id, found);
    // The other entries get the same answer without asking again
    found.then((items) => items.forEach((item) => !cache.has(item.id) && cache.set(item.id, found!)));
  }
  return found;
}

/**
 * The franchise of an anime in watch order (prequels and sequels by release), or []. The page
 * already has the anime's relations: with no prequel or sequel there's nothing to walk, and no
 * request.
 */
export function useWatchOrder(anime: Pick<AnimeDetail, "id" | "relations">) {
  const { id } = anime;
  const linked = anime.relations.some((r) => r.relationType === "PREQUEL" || r.relationType === "SEQUEL");
  const [items, setItems] = useState<CatalogItem[]>([]);
  useEffect(() => {
    let cancelled = false;
    setItems([]);
    if (linked) watchOrder(id).then((found) => !cancelled && setItems(found));
    return () => {
      cancelled = true;
    };
  }, [id, linked]);
  return items;
}

export interface OrderMark {
  label: string;
  className: string;
}

/**
 * A label for each entry of the watch order: where you are, what's watched, what's being watched,
 * and the next one to watch after the last one completed
 */
export function watchOrderMarks(
  items: CatalogItem[],
  currentId: number,
  entryOf: (anime: CatalogItem) => TrackerEntry | null
): (OrderMark | null)[] {
  const entries = items.map(entryOf);
  const lastDone = entries.reduce((last, e, i) => (e?.status === "completed" ? i : last), -1);
  const nextIndex = lastDone >= 0 ? entries.findIndex((e, i) => i > lastDone && e?.status !== "completed") : -1;
  return items.map((item, i) => {
    const entry = entries[i];
    if (item.id === currentId) return { label: "Estás aquí", className: "bg-white text-black" };
    if (entry?.status === "completed") return { label: "Visto", className: "bg-blue-600 text-white" };
    if (entry?.status === "watching") return { label: "Viendo", className: "bg-emerald-600 text-white" };
    if (i === nextIndex) return { label: "Siguiente", className: "bg-red-500 text-black" };
    return null;
  });
}
