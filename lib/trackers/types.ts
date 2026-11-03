/**
 * Provider-agnostic view of a list service (MyAnimeList now, AniList later). Routes and the
 * library only use these types; each adapter maps its service's API onto them.
 */

export type TrackerId = "myanimelist";

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
}

/** Fields the viewer edits by hand; a null score clears it */
export interface EntryChanges {
  status?: ListStatus;
  score?: number | null;
}

export interface Tracker {
  id: TrackerId;
  name: string;
  /** Which ID the service addresses anime by; the other one is resolved before calling it */
  idKind: "mal" | "anilist";
  /** Every entry on the signed-in user's anime list */
  getList(token: string): Promise<TrackerEntry[]>;
  getEntry(token: string, ids: TrackerIds): Promise<TrackerEntry | null>;
  /** Marks `episode` as watched; never lowers the progress already on the list */
  saveProgress(token: string, ids: TrackerIds, episode: number): Promise<{ updated: boolean; entry: TrackerEntry | null }>;
  /** Adds the anime as planned unless it's already on the list, in any status */
  addToPlanning(token: string, ids: TrackerIds): Promise<{ added: boolean; entry: TrackerEntry | null }>;
  /** Sets the status and/or score, adding the anime to the list when it isn't there yet */
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
