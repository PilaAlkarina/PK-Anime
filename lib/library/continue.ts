import { useMemo } from "react";
import { continueWatching, useWatchHistory, type ContinueItem } from "./history";
import { useMyList } from "./my-list";
import { mergeContinueWatching, useRemoteLibrary } from "./remote";
import { freshen, useFreshCards } from "./fresh-cards";

export interface NewEpisodesItem extends ContinueItem {
  /** Episodes out that haven't been watched, counting the one to resume */
  newCount: number;
}

/**
 * A show being watched whose next episode aired after the last time it was watched: you had
 * caught up and there's more now. Only when that episode hasn't been started.
 */
function isNew(item: ContinueItem) {
  const aired = item.anime.airedEpisode;
  return !!aired && item.progress === 0 && aired.episode >= item.episode && aired.airingAt * 1000 > item.updatedAt;
}

/**
 * The home screen's "Nuevos episodios" and "Seguir viendo", from the watch history and both
 * lists. Saved cards are swapped for current ones, so a show that was caught up comes back
 * when its next episode airs.
 */
export function useContinueRows() {
  const history = useWatchHistory();
  const remote = useRemoteLibrary();
  const myList = useMyList();

  const ids = useMemo(() => {
    const active = (e: { status: string; rewatching?: boolean }) => e.status === "watching" || !!e.rewatching;
    return [
      ...history.map((h) => h.anime.id),
      ...myList.filter(active).map((e) => e.anime.id),
      ...(remote?.entries ?? []).filter(active).map((e) => e.anilistId ?? 0),
    ].filter((id) => id > 0);
  }, [history, myList, remote]);
  const fresh = useFreshCards(ids);

  return useMemo(() => {
    const refresh = (anime: Parameters<typeof freshen>[1]) => freshen(fresh, anime);
    const items = mergeContinueWatching(
      continueWatching(history.map((h) => ({ ...h, anime: refresh(h.anime) }))),
      remote,
      myList.map((e) => ({ ...e, anime: refresh(e.anime) })),
      refresh
    );
    const newEpisodes: NewEpisodesItem[] = [];
    const resume: ContinueItem[] = [];
    for (const item of items) {
      if (isNew(item)) newEpisodes.push({ ...item, newCount: item.anime.airedEpisode!.episode - item.episode + 1 });
      else resume.push(item);
    }
    // Newest release first
    newEpisodes.sort((a, b) => b.anime.airedEpisode!.airingAt - a.anime.airedEpisode!.airingAt);
    return { newEpisodes, resume };
  }, [fresh, history, myList, remote]);
}

/** "Nuevo" or "3 nuevos", for the card badge */
export const newEpisodesBadge = (count: number) => (count > 1 ? `${count} NUEVOS` : "NUEVO");
