import { useSyncExternalStore } from "react";

/**
 * Several people on one device (a family TV): each profile has its own copy of what the library
 * keeps in this browser (Mi lista, the history, episode progress, the list view, recent searches
 * and playback preferences). The theme, the player volume and the TV/phone link stay per device.
 *
 * The first profile ("main") uses the storage keys from before profiles existed, so nothing has
 * to move; the others add "::<id>" to every key. Switching reloads the page, since every store
 * caches its value.
 */

export interface Profile {
  id: string;
  name: string;
  /** Avatar color */
  color: string;
  /**
   * The list service account last signed in while this profile was active ("provider:user").
   * Switching to a profile signs out an account that belongs to someone else.
   */
  account?: string | null;
}

interface ProfilesState {
  profiles: Profile[];
  active: string;
}

const KEY = "pk_profiles";
const MAIN_ID = "main";
/** Keys that belong to the device, not to a profile */
const DEVICE_KEYS = new Set([KEY, "pk_theme", "pk_tv_link", "pk_remote_token", "pk_screensaver"]);
export const PROFILE_COLORS = ["#FF4A2E", "#2EE6FF", "#A6E35A", "#FFD23F", "#FF5C9A", "#8B7CFF", "#FF8A1F", "#E8E4DA"];
export const MAX_PROFILES = 6;

const DEFAULT_STATE: ProfilesState = {
  profiles: [{ id: MAIN_ID, name: "Principal", color: PROFILE_COLORS[0] }],
  active: MAIN_ID,
};

let cached: ProfilesState | null = null;
const listeners = new Set<() => void>();

function read(): ProfilesState {
  if (cached) return cached;
  try {
    const stored = JSON.parse(localStorage.getItem(KEY) || "null") as ProfilesState | null;
    if (stored && Array.isArray(stored.profiles) && stored.profiles.length > 0) {
      const active = stored.profiles.some((p) => p.id === stored.active) ? stored.active : stored.profiles[0].id;
      cached = { profiles: stored.profiles, active };
      return cached;
    }
  } catch {}
  cached = DEFAULT_STATE;
  return cached;
}

function write(next: ProfilesState) {
  cached = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {}
  listeners.forEach((l) => l());
}

/** The storage key for a profile */
export function keyForProfile(key: string, profileId: string) {
  return DEVICE_KEYS.has(key) || profileId === MAIN_ID ? key : `${key}::${profileId}`;
}

/** The storage key for the active profile */
export function profileKey(key: string) {
  if (typeof window === "undefined") return key;
  return keyForProfile(key, read().active);
}

/** Whether a stored key belongs to `profileId`, and its base name if so */
export function baseKeyFor(storedKey: string, profileId: string): string | null {
  if (profileId === MAIN_ID) return storedKey.includes("::") ? null : storedKey;
  const suffix = `::${profileId}`;
  return storedKey.endsWith(suffix) ? storedKey.slice(0, -suffix.length) : null;
}

export const getProfiles = read;

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export function useProfiles() {
  return useSyncExternalStore(subscribe, read, () => DEFAULT_STATE);
}

export function activeProfile(state: ProfilesState = read()) {
  return state.profiles.find((p) => p.id === state.active) ?? state.profiles[0];
}

export function addProfile(): Profile | null {
  const state = read();
  if (state.profiles.length >= MAX_PROFILES) return null;
  const used = new Set(state.profiles.map((p) => p.color));
  let n = state.profiles.length + 1;
  while (state.profiles.some((p) => p.name === `Perfil ${n}`)) n++;
  const profile: Profile = {
    id: Math.random().toString(36).slice(2, 8),
    name: `Perfil ${n}`,
    color: PROFILE_COLORS.find((c) => !used.has(c)) ?? PROFILE_COLORS[state.profiles.length % PROFILE_COLORS.length],
  };
  write({ ...state, profiles: [...state.profiles, profile] });
  return profile;
}

export function updateProfile(id: string, changes: Partial<Pick<Profile, "name" | "color" | "account">>) {
  const state = read();
  write({ ...state, profiles: state.profiles.map((p) => (p.id === id ? { ...p, ...changes } : p)) });
}

/** Removes a profile and everything it kept on this device; the first profile can't be removed */
export function removeProfile(id: string) {
  const state = read();
  if (id === MAIN_ID || !state.profiles.some((p) => p.id === id)) return;
  try {
    const suffix = `::${id}`;
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const key = localStorage.key(i);
      if (key?.endsWith(suffix)) localStorage.removeItem(key);
    }
  } catch {}
  write({ profiles: state.profiles.filter((p) => p.id !== id), active: state.active === id ? MAIN_ID : state.active });
}

/** Makes `id` the active profile. The caller reloads the page afterwards. */
export function setActiveProfile(id: string) {
  const state = read();
  if (state.profiles.some((p) => p.id === id)) write({ ...state, active: id });
}

/** "myanimelist:Name", to tell whose account is signed in */
export const accountSignature = (account: { provider: { id: string } | null; user: { name: string } | null }) =>
  account.provider && account.user ? `${account.provider.id}:${account.user.name}` : null;

// Asked once per browser session when there are several profiles
const PICKED_KEY = "pk_profile_picked";
export function profilePicked() {
  try {
    return sessionStorage.getItem(PICKED_KEY) === "1";
  } catch {
    return true;
  }
}
export function markProfilePicked() {
  try {
    sessionStorage.setItem(PICKED_KEY, "1");
  } catch {}
}
