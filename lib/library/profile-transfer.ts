import { getWatchHistory, mergeHistory, type HistoryEntry } from "./history";
import { getMyList, saveLocalEntries, type LocalEntry } from "./my-list";
import { activeProfile, addProfile, baseKeyFor, getProfiles, keyForProfile, updateProfile } from "./profiles";

/**
 * A profile sent from a phone to its linked TV: Mi lista, the watch history and the progress
 * the player saved per episode. The TV makes a new profile of it or merges it into its own.
 */
export interface ProfileTransfer {
  name: string;
  color: string;
  entries: LocalEntry[];
  history: HistoryEntry[];
  /** Player progress by its storage key without the profile suffix ("anime_progress:ani:1535:4") */
  progress: Record<string, { currentTime?: number; duration?: number; updatedAt?: number }>;
}

const PROGRESS_PREFIX = "anime_progress:";
const MAX_PROGRESS = 3000;
const ENTRIES_KEY = "pk_library_entries";
const HISTORY_KEY = "pk_library_history";

/** This device's active profile, ready to send */
export function collectProfile(): ProfileTransfer {
  const profile = activeProfile();
  const progress: ProfileTransfer["progress"] = {};
  try {
    for (let i = 0; i < localStorage.length && Object.keys(progress).length < MAX_PROGRESS; i++) {
      const stored = localStorage.key(i);
      const base = stored ? baseKeyFor(stored, profile.id) : null;
      if (!base?.startsWith(PROGRESS_PREFIX)) continue;
      try {
        progress[base] = JSON.parse(localStorage.getItem(stored!) || "null");
      } catch {}
    }
  } catch {}
  return {
    // "Principal" says nothing on another device
    name: profile.id === "main" ? "Móvil" : profile.name,
    color: profile.color,
    entries: getMyList(),
    history: getWatchHistory(),
    progress,
  };
}

/** Writes the episode progress a profile doesn't have yet, or has older */
function writeProgress(profileId: string, progress: ProfileTransfer["progress"]) {
  for (const [base, value] of Object.entries(progress)) {
    if (!base.startsWith(PROGRESS_PREFIX) || !value) continue;
    const key = keyForProfile(base, profileId);
    try {
      const current = JSON.parse(localStorage.getItem(key) || "null");
      if (!current || (value.updatedAt ?? 0) > (current.updatedAt ?? 0)) localStorage.setItem(key, JSON.stringify(value));
    } catch {}
  }
}

/** A new profile with the phone's data; null when there's no room for another */
export function createProfileFrom(data: ProfileTransfer): string | null {
  const profile = addProfile();
  if (!profile) return null;
  let name = data.name;
  for (let n = 2; getProfiles().profiles.some((p) => p.id !== profile.id && p.name === name); n++) name = `${data.name} ${n}`;
  updateProfile(profile.id, { name, color: data.color || profile.color });
  try {
    localStorage.setItem(keyForProfile(ENTRIES_KEY, profile.id), JSON.stringify(data.entries));
    localStorage.setItem(keyForProfile(HISTORY_KEY, profile.id), JSON.stringify(data.history));
  } catch {}
  writeProgress(profile.id, data.progress);
  return profile.id;
}

/**
 * Merges the phone's data into the active profile, never undoing anything: an anime only on the
 * phone is added, and one on both takes the phone's entry when it's further along (keeping a
 * score the phone doesn't have)
 */
export function mergeIntoActive(data: ProfileTransfer) {
  const mine = new Map(getMyList().map((e) => [e.anime.id, e]));
  const changed: LocalEntry[] = [];
  for (const entry of data.entries) {
    const current = mine.get(entry.anime.id);
    if (!current) changed.push(entry);
    else if (entry.progress > current.progress || (entry.progress === current.progress && (entry.updatedAt ?? 0) > (current.updatedAt ?? 0))) {
      changed.push({ ...entry, score: entry.score ?? current.score });
    }
  }
  saveLocalEntries(changed);
  mergeHistory(data.history);
  writeProgress(activeProfile().id, data.progress);
  return changed.length;
}
