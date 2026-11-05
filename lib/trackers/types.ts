import type { CatalogItem } from "@/lib/anilist/types";

/**
 * Provider-agnostic view of a list service (MyAnimeList, AniList). Routes and the library only
 * use these types; each adapter maps its service's API onto them.
 */

export type TrackerId = "myanimelist" | "anilist";

export type ListStatus = "watching" | "planning" | "completed" | "paused" | "dropped";

export interface TrackerIds {
  anilistId: number | null;
  malId: number | null;
}

export interface TrackerEntry extends TrackerIds {
  status: ListStatus;
  /** Episodes watched */
  progress: number;
  /** 0–10, null when unscored */
  score: number | null;
  rewatching: boolean;
  /** Unix ms */
  updatedAt: number | null;
  /** When it was finished, as the service has it: "YYYY-MM-DD", or shorter when only the year or month is known */
  finishedAt?: string | null;
}

/** Fields set by hand or by an export; a null score clears it */
export interface EntryChanges {
  status?: ListStatus;
  score?: number | null;
  /** Episodes watched. Marking an anime completed counts all of them anyway */
  progress?: number;
}

export interface TrackerList {
  entries: TrackerEntry[];
  /**
   * Catalog cards the service sent along with the list (AniList, which is also the catalog).
   * Without them the library route looks the entries up by MAL ID.
   */
  cards?: CatalogItem[];
}

export interface Tracker {
  id: TrackerId;
  name: string;
  /** Which ID the service addresses anime by; the other one is resolved before calling it */
  idKind: "mal" | "anilist";
  /** Every entry on the signed-in user's anime list; `userId` saves asking who the user is */
  getList(token: string, userId?: number | null): Promise<TrackerList>;
  getEntry(token: string, ids: TrackerIds): Promise<TrackerEntry | null>;
  /** Marks `episode` as watched; never lowers the progress already on the list */
  saveProgress(token: string, ids: TrackerIds, episode: number): Promise<{ updated: boolean; entry: TrackerEntry | null }>;
  /** Adds the anime as planned unless it's already on the list, in any status */
  addToPlanning(token: string, ids: TrackerIds): Promise<{ added: boolean; entry: TrackerEntry | null }>;
  /** Sets the status, score and/or progress, adding the anime to the list when it isn't there yet */
  updateEntry(token: string, ids: TrackerIds, changes: EntryChanges): Promise<TrackerEntry>;
  /** Takes the anime off the list; does nothing when it isn't there */
  removeEntry(token: string, ids: TrackerIds): Promise<void>;
}

export class TrackerError extends Error {
  constructor(message: string, public status?: number) {
    super(message);
    this.name = "TrackerError";
  }
}
