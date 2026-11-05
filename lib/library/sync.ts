import type { CatalogItem } from "@/lib/anilist/types";
import type { EntryChanges, TrackerEntry } from "@/lib/trackers/types";
import { catalogSnapshot } from "./history";
import {
  findLocalEntry,
  getMyList,
  localEntry,
  mirrorRemoteEntry,
  removeLocalEntry,
  saveLocalEntries,
  type LocalEntry,
} from "./my-list";
import {
  findRemoteEntry,
  refreshRemoteLibrary,
  removeRemoteEntry,
  upsertRemoteEntry,
  type RemoteLibrary,
} from "./remote";

/**
 * Import and export between this device's list and the list service share one rule: copy
 * what the other side lacks, never undo what it has. A missing anime is copied whole; an
 * anime on both sides only takes the further progress (with the status that came with it)
 * and a score where there was none. Status changes at equal progress stay on their side.
 */
function changesFrom(source: TrackerEntry, target: TrackerEntry | null): EntryChanges | null {
  if (!target) {
    const changes: EntryChanges = { status: source.status };
    if (source.progress > 0) changes.progress = source.progress;
    if (source.score) changes.score = source.score;
    return changes;
  }
  const changes: EntryChanges = {};
  if (source.progress > target.progress) {
    changes.progress = source.progress;
    if (source.status !== target.status) changes.status = source.status;
  }
  if (source.score && !target.score) changes.score = source.score;
  return Object.keys(changes).length ? changes : null;
}

export interface PendingChange {
  anime: CatalogItem;
  changes: EntryChanges;
  /** Not on the other side at all */
  isNew: boolean;
  /** When the source changed it, so an import keeps the remote list's order */
  updatedAt?: number | null;
}

/** What this device's list has that the remote list lacks */
export function pendingExport(local: LocalEntry[], remote: RemoteLibrary): PendingChange[] {
  const pending: PendingChange[] = [];
  for (const entry of local) {
    const target = findRemoteEntry(remote, entry.anime);
    const changes = changesFrom(entry, target);
    if (changes) pending.push({ anime: entry.anime, changes, isNew: !target });
  }
  return pending;
}

/** What the remote list has that this device's list lacks */
export function pendingImport(local: LocalEntry[], remote: RemoteLibrary): PendingChange[] {
  const pending: PendingChange[] = [];
  for (const entry of remote.entries) {
    const anime = entry.anilistId ? remote.anime.get(entry.anilistId) : undefined;
    // Entries AniList doesn't know have no card to show, on either side
    if (!anime) continue;
    const target = findLocalEntry(local, anime);
    const changes = changesFrom(entry, target);
    if (changes) pending.push({ anime, changes, isNew: !target, updatedAt: entry.updatedAt });
  }
  return pending;
}

export interface TransferResult {
  added: number;
  updated: number;
  failed: number;
}

async function send(url: string, body: unknown, method = "POST") {
  const res = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return res.json().catch(() => ({}));
}

async function patchRemote(anime: CatalogItem, changes: EntryChanges): Promise<TrackerEntry | null> {
  const data = await send("/api/tracker/entry", { anilistId: anime.id, malId: anime.malId, ...changes }, "PATCH").catch(
    () => null
  );
  return data?.success && data.entry ? data.entry : null;
}

/**
 * Copies the pending changes to the remote list, one request after another (services throttle
 * bursts). `onProgress` hears how many are done, for long lists.
 */
export async function exportToRemote(
  pending: PendingChange[],
  onProgress?: (done: number) => void
): Promise<TransferResult> {
  const result: TransferResult = { added: 0, updated: 0, failed: 0 };
  for (const [i, { anime, changes, isNew }] of pending.entries()) {
    const entry = await patchRemote(anime, changes);
    onProgress?.(i + 1);
    if (!entry) {
      result.failed++;
      continue;
    }
    upsertRemoteEntry(entry, catalogSnapshot(anime));
    result[isNew ? "added" : "updated"]++;
  }
  // Every success is already merged; only a failure leaves the copy unsure of the service's state
  if (result.failed > 0) await refreshRemoteLibrary();
  return result;
}

/** Copies the pending changes into this device's list; local, so it never fails */
export function importFromRemote(pending: PendingChange[]): TransferResult {
  const local = getMyList();
  const now = Date.now();
  const entries = pending.map(({ anime, changes, updatedAt }, i) =>
    localEntry(anime, { ...findLocalEntry(local, anime), ...changes, updatedAt: updatedAt ?? now - i })
  );
  saveLocalEntries(entries);
  const added = pending.filter((p) => p.isNew).length;
  return { added, updated: pending.length - added, failed: 0 };
}

/**
 * Puts one anime on the remote list: with what this device knows about it (status, progress,
 * score) when it's in the local list, as planned otherwise. False when the request failed.
 */
export async function addToRemote(anime: CatalogItem) {
  const local = findLocalEntry(getMyList(), anime);
  const entry = await patchRemote(anime, (local && changesFrom(local, null)) || { status: "planning" });
  if (!entry) return false;
  upsertRemoteEntry(entry, catalogSnapshot(anime));
  mirrorRemoteEntry(anime, entry);
  return true;
}

/**
 * Sets the status, score or progress on the remote list, and keeps this device's copy in
 * step. False when the request failed.
 */
export async function updateRemoteEntry(anime: CatalogItem, changes: EntryChanges) {
  const entry = await patchRemote(anime, changes);
  if (!entry) return false;
  upsertRemoteEntry(entry, catalogSnapshot(anime));
  mirrorRemoteEntry(anime, entry);
  return true;
}

/** Takes the anime off the remote list and this device's; false when the request failed */
export async function removeFromRemote(anime: CatalogItem) {
  const data = await send("/api/tracker/entry", { anilistId: anime.id, malId: anime.malId }, "DELETE").catch(() => null);
  if (!data?.success) return false;
  removeRemoteEntry(anime);
  removeLocalEntry(anime.id);
  return true;
}
