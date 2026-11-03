import { useSyncExternalStore } from "react";

/**
 * localStorage-backed stores for per-device library state ("Mi lista", watch history,
 * preferences). Reads and writes never throw: private mode or blocked storage just
 * behaves like an empty store.
 */

export function readJSON<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export function writeJSON(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {}
}

/**
 * `normalize` turns whatever is stored (null when nothing is) into a complete value, for
 * stores whose shape grows over time or that migrate older keys. Its result is cached, so
 * the hook sees a stable reference.
 */
export function createStore<T>(key: string, fallback: T, normalize?: (stored: unknown) => T) {
  const listeners = new Set<() => void>();
  let cached: T | undefined;

  const get = () => {
    if (cached === undefined) cached = normalize ? normalize(readJSON<unknown>(key, null)) : readJSON(key, fallback);
    return cached;
  };

  const set = (next: T) => {
    cached = next;
    writeJSON(key, next);
    listeners.forEach((l) => l());
  };

  const subscribe = (listener: () => void) => {
    listeners.add(listener);
    // Another tab changed the same key
    const onStorage = (e: StorageEvent) => {
      if (e.key !== key) return;
      cached = undefined;
      listener();
    };
    window.addEventListener("storage", onStorage);
    return () => {
      listeners.delete(listener);
      window.removeEventListener("storage", onStorage);
    };
  };

  // The server render and hydration see the fallback; the stored value arrives right after
  const useValue = () => useSyncExternalStore(subscribe, get, () => fallback);

  return { get, set, useValue };
}
