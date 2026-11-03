import type { CatalogItem } from "@/lib/anilist/types";
import { catalogSnapshot } from "./history";
import { createStore } from "./storage";

const store = createStore<CatalogItem[]>("pk_library_my_list", []);

export const useMyList = store.useValue;

export function isInMyList(list: CatalogItem[], animeId: number) {
  return list.some((item) => item.id === animeId);
}

export function toggleMyList(anime: CatalogItem) {
  const list = store.get();
  if (isInMyList(list, anime.id)) {
    store.set(list.filter((item) => item.id !== anime.id));
    return;
  }
  store.set([catalogSnapshot(anime), ...list]);
}
