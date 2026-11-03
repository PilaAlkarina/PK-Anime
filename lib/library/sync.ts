import type { CatalogItem } from "@/lib/anilist/types";
import type { TrackerEntry } from "@/lib/trackers/types";
import { catalogSnapshot, watchedEpisodes, type HistoryEntry } from "./history";
import { findRemoteEntry, refreshRemoteLibrary, upsertRemoteEntry, type RemoteLibrary } from "./remote";

const PLAN_BATCH = 25;

export interface PendingExport {
  /** "Mi lista" entries not on the remote list in any status */
  plan: CatalogItem[];
  /** Local progress ahead of the remote list */
  progress: { anime: CatalogItem; episodes: number }[];
}

/** What exists only on this device and can be copied to the remote list */
export function pendingExport(myList: CatalogItem[], history: HistoryEntry[], remote: RemoteLibrary): PendingExport {
  const progress = history
    .map((entry) => ({ anime: entry.anime, episodes: watchedEpisodes(entry) }))
    .filter(({ anime, episodes }) => episodes > 0 && (findRemoteEntry(remote, anime)?.progress ?? -1) < episodes);
  // Saving progress already puts an anime on the list, as watching
  const withProgress = new Set(progress.map((p) => p.anime.id));
  const plan = myList.filter((item) => !withProgress.has(item.id) && !findRemoteEntry(remote, item));
  return { plan, progress };
}

export interface ExportResult {
  added: number;
  progressSaved: number;
  failed: number;
}

async function post(url: string, body: unknown) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return res.json().catch(() => ({}));
}

/** Copies the pending items to the remote list, one request after another */
export async function exportToRemote({ plan, progress }: PendingExport): Promise<ExportResult> {
  const result: ExportResult = { added: 0, progressSaved: 0, failed: 0 };

  for (let i = 0; i < plan.length; i += PLAN_BATCH) {
    const batch = plan.slice(i, i + PLAN_BATCH);
    const data = await post("/api/tracker/plan", {
      items: batch.map((item) => ({ anilistId: item.id, malId: item.malId })),
    }).catch(() => null);
    if (!data?.success) {
      result.failed += batch.length;
      continue;
    }
    data.results.forEach((r: { added: boolean; entry: TrackerEntry | null; error?: string }, index: number) => {
      if (r.error) result.failed++;
      if (r.added) result.added++;
      if (r.entry) upsertRemoteEntry(r.entry, batch[index]);
    });
  }

  for (const { anime, episodes } of progress) {
    const data = await post("/api/tracker/progress", { anilistId: anime.id, malId: anime.malId, episode: episodes }).catch(
      () => null
    );
    if (!data?.success) {
      result.failed++;
      continue;
    }
    if (data.updated) result.progressSaved++;
    if (data.entry) upsertRemoteEntry(data.entry, anime);
  }

  await refreshRemoteLibrary();
  return result;
}

/** Adds one anime to the remote list as planned; false when the request failed */
export async function addToRemotePlan(anime: CatalogItem) {
  const data = await post("/api/tracker/plan", { items: [{ anilistId: anime.id, malId: anime.malId }] }).catch(() => null);
  const entry: TrackerEntry | null | undefined = data?.results?.[0]?.entry;
  if (!data?.success || !entry) return false;
  upsertRemoteEntry(entry, catalogSnapshot(anime));
  return true;
}
