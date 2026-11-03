import { createStore } from "./storage";

const MAX_RECENT = 8;

const store = createStore<string[]>("pk_recent_searches", []);

export const useRecentSearches = store.useValue;

/** Most recent first, without repeats (case-insensitive) */
export function addRecentSearch(query: string) {
  const q = query.trim();
  if (!q) return;
  const rest = store.get().filter((r) => r.toLowerCase() !== q.toLowerCase());
  store.set([q, ...rest].slice(0, MAX_RECENT));
}

export function clearRecentSearches() {
  store.set([]);
}
