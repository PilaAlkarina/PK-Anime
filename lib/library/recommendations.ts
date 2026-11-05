import { useEffect, useMemo, useState } from "react";
import type { AnimeDetail, CatalogItem } from "@/lib/anilist/types";
import type { TrackerEntry } from "@/lib/trackers/types";
import { useWatchHistory } from "./history";
import { useMyList } from "./my-list";
import { useAccount } from "./account";
import { useRemoteLibrary } from "./remote";

export interface BecauseRow {
  seed: CatalogItem;
  items: CatalogItem[];
}

const MAX_ROWS = 2;
/** A score this low means it didn't land; its recommendations would be more of the same */
const MIN_SCORE = 7;
/** Watching counts once it's clearly being followed */
const MIN_PROGRESS = 3;
const MIN_ITEMS = 4;
const REMOTE_WAIT_MS = 4000;

// AniList recommendations per anime, kept for the session
const cache = new Map<number, Promise<CatalogItem[]>>();
function recommendationsFor(id: number) {
  let found = cache.get(id);
  if (!found) {
    found = fetch(`/api/catalog/anime/${id}`)
      .then((res) => res.json())
      .then((data) => (data.success ? (data.anime as AnimeDetail).recommendations : []))
      .catch(() => {
        cache.delete(id);
        return [];
      });
    cache.set(id, found);
  }
  return found;
}

/**
 * "Porque viste X" rows for the home screen: AniList's recommendations for the latest anime
 * completed (or followed for a few episodes) that weren't scored below 7, leaving out what's
 * already on a list or in the history.
 */
export function useBecauseYouWatched(): BecauseRow[] {
  const remote = useRemoteLibrary();
  const myList = useMyList();
  const history = useWatchHistory();

  const { seeds, known } = useMemo(() => {
    const candidates: { anime: CatalogItem; entry: TrackerEntry }[] = myList.map((e) => ({ anime: e.anime, entry: e }));
    for (const entry of remote?.entries ?? []) {
      const anime = entry.anilistId ? remote!.anime.get(entry.anilistId) : undefined;
      if (anime) candidates.push({ anime, entry });
    }
    const known = new Set<number>([...candidates.map((c) => c.anime.id), ...history.map((h) => h.anime.id)]);
    const seen = new Set<number>();
    const seeds = candidates
      .filter(({ entry }) => {
        if (entry.score && entry.score < MIN_SCORE) return false;
        return entry.status === "completed" || (entry.status === "watching" && entry.progress >= MIN_PROGRESS);
      })
      .sort((a, b) => (b.entry.updatedAt ?? 0) - (a.entry.updatedAt ?? 0))
      .filter(({ anime }) => !seen.has(anime.id) && !!seen.add(anime.id))
      .slice(0, MAX_ROWS + 2)
      .map((c) => c.anime);
    return { seeds, known };
  }, [remote, myList, history]);

  // Signed in, the seeds wait for the remote list: picked from this device's list first, they'd
  // change when it arrives and the recommendations already fetched would go to waste. Not for
  // ever, though: a list that doesn't come within a few seconds isn't waited for
  const account = useAccount();
  const [waitOver, setWaitOver] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setWaitOver(true), REMOTE_WAIT_MS);
    return () => clearTimeout(timer);
  }, []);
  const ready = account !== null && (!account.signedIn || remote !== null || waitOver);

  const seedKey = ready ? seeds.map((s) => s.id).join(",") : "";
  const [rows, setRows] = useState<BecauseRow[]>([]);
  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    Promise.all(seeds.map((seed) => recommendationsFor(seed.id).then((items) => ({ seed, items })))).then((all) => {
      if (cancelled) return;
      // Each recommendation shows up once, under the first row that has it
      const shown = new Set<number>();
      const next: BecauseRow[] = [];
      for (const { seed, items } of all) {
        const fresh = items.filter((i) => !known.has(i.id) && !shown.has(i.id));
        if (fresh.length < MIN_ITEMS) continue;
        fresh.forEach((i) => shown.add(i.id));
        next.push({ seed, items: fresh });
        if (next.length === MAX_ROWS) break;
      }
      setRows(next);
    });
    return () => {
      cancelled = true;
    };
    // `known` changes with every list update; the rows only follow the seeds
  }, [seedKey]);

  return rows;
}

export const becauseTitle = (seed: CatalogItem) => `Porque viste ${seed.title}`;
