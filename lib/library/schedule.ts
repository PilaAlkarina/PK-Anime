import type { AiringEpisode, CatalogItem, ScheduleEntry } from "@/lib/anilist/types";
import type { ListStatus } from "@/lib/trackers/types";
import { createStore } from "./storage";

/**
 * The calendar's personal layer: what each episode in the schedule means for you (watched, out,
 * behind on it…), your shows that skip a week, and a summary of the week. Pure functions over
 * the schedule, your list and the time, so the screen only draws them.
 */

/** Right after airing an episode is still reaching the servers: "disponible en breve" */
export const FRESH_MS = 30 * 60_000;
// A show whose next episode is further away than this is on hiatus, not skipping a week
const MAX_REST_WEEKS = 6;

/** What you have of an anime: its list status (null when only in the watch history) and the episodes watched */
export interface MyEntry {
  status: ListStatus | null;
  watched: number;
}

/** Statuses the calendar reminds you about; paused, dropped and completed shows don't nag */
const ACTIVE: ListStatus[] = ["watching", "planning"];
export const isActive = (mine: MyEntry | undefined): mine is MyEntry => !!mine?.status && ACTIVE.includes(mine.status);

/** Episodes out by `now`, judging by the card's next episode */
export function airedEpisodes(anime: Pick<CatalogItem, "nextEpisode" | "availableEpisodes" | "episodes">, now: number) {
  const next = anime.nextEpisode;
  if (next) return next.airingAt * 1000 <= now ? next.episode : next.episode - 1;
  return anime.availableEpisodes ?? anime.episodes ?? 0;
}

export type EpisodeState =
  /** You've watched it */
  | { kind: "seen" }
  /** Aired a moment ago; the servers may not have it yet */
  | { kind: "fresh"; minutesAgo: number }
  /** Out, and the next one for you (or the show isn't on your list) */
  | { kind: "available"; play: number }
  /** Episodes out that you haven't watched; `play` is the first of them */
  | { kind: "behind"; missing: number; play: number; started: boolean; minutesLeft: number | null }
  /** Not out yet; `minutesLeft` only when it airs later today */
  | { kind: "upcoming"; minutesLeft: number | null };

export function episodeState(entry: ScheduleEntry, mine: MyEntry | undefined, now: number, endOfToday: number): EpisodeState {
  const at = entry.airingAt * 1000;
  const watched = mine?.watched ?? 0;
  const behind = (missing: number, minutesLeft: number | null): EpisodeState => ({
    kind: "behind",
    missing,
    play: watched + 1,
    started: watched > 0,
    minutesLeft,
  });

  if (at <= now) {
    if (now - at < FRESH_MS) return { kind: "fresh", minutesAgo: Math.max(1, Math.round((now - at) / 60_000)) };
    if (mine && watched >= entry.episode) return { kind: "seen" };
    if (isActive(mine) && watched < entry.episode - 1) return behind(entry.episode - watched, null);
    return { kind: "available", play: entry.episode };
  }

  const minutesLeft = at < endOfToday ? Math.round((at - now) / 60_000) : null;
  if (isActive(mine)) {
    const missing = airedEpisodes(entry.anime, now) - watched;
    if (missing > 0) return behind(missing, minutesLeft);
  }
  return { kind: "upcoming", minutesLeft };
}

export const isPremiere = (entry: ScheduleEntry) => entry.episode === 1;
export const isFinale = (entry: ScheduleEntry) => !!entry.anime.episodes && entry.episode === entry.anime.episodes;

/** A show on your list with no episode this week: where it would have been, and when it's back */
export interface RestSlot {
  anime: CatalogItem;
  /** When it would have aired (ms) */
  slot: number;
  returns: AiringEpisode;
}

/**
 * Your airing shows that skip the window [from, to): their next episode comes after it, a week
 * or more after the last one. Placed at their usual day and time inside the window. Only for
 * windows that aren't over, since past breaks can't be told from the cards.
 */
export function restsInWindow(
  anime: CatalogItem[],
  entries: ScheduleEntry[],
  from: number,
  to: number,
  now: number
): RestSlot[] {
  if (to <= now) return [];
  const airing = new Set(entries.map((e) => e.anime.id));
  const rests: RestSlot[] = [];
  for (const item of anime) {
    const next = item.nextEpisode;
    if (item.status !== "RELEASING" || !next || next.episode <= 1 || airing.has(item.id)) continue;
    const nextAt = next.airingAt * 1000;
    if (nextAt < to) continue;
    // A week at a time in local dates, so a daylight-saving change keeps the hour
    const slot = new Date(nextAt);
    let weeks = 0;
    while (slot.getTime() >= to && weeks <= MAX_REST_WEEKS) {
      slot.setDate(slot.getDate() - 7);
      weeks++;
    }
    if (weeks > MAX_REST_WEEKS || slot.getTime() < from) continue;
    rests.push({ anime: item, slot: slot.getTime(), returns: next });
  }
  return rests.sort((a, b) => a.slot - b.slot);
}

export interface WeekSummary {
  /** Episodes of shows you're watching or plan to */
  mine: number;
  /** Of those, out and not watched */
  unseen: number;
  premieres: number;
  finales: number;
}

export function summarizeWeek(entries: ScheduleEntry[], mine: Map<number, MyEntry>, now: number): WeekSummary {
  const listed = entries.filter((e) => isActive(mine.get(e.anime.id)));
  return {
    mine: listed.length,
    unseen: listed.filter((e) => e.airingAt * 1000 + FRESH_MS <= now && mine.get(e.anime.id)!.watched < e.episode).length,
    premieres: entries.filter(isPremiere).length,
    finales: entries.filter(isFinale).length,
  };
}

/** Shows you're watching that are still airing and have episodes out you haven't seen, most behind first */
export function catchUpList(anime: CatalogItem[], mine: Map<number, MyEntry>, now: number) {
  return anime
    .map((item) => {
      const entry = mine.get(item.id);
      const missing = entry?.status === "watching" ? airedEpisodes(item, now) - entry.watched : 0;
      return { anime: item, missing, next: (entry?.watched ?? 0) + 1 };
    })
    .filter((c) => c.anime.status === "RELEASING" && c.missing > 0)
    .sort((a, b) => b.missing - a.missing);
}

/** "En 1 h 20 min", "En 45 min" */
export function countdownLabel(minutes: number) {
  if (minutes < 60) return `En ${minutes} min`;
  const rest = minutes % 60;
  return `En ${Math.floor(minutes / 60)} h${rest ? ` ${rest} min` : ""}`;
}

/** What the calendar shows: everything, or only your list's watching and planned shows */
export interface ScheduleView {
  onlyMine: boolean;
  watching: boolean;
  planning: boolean;
}

const viewStore = createStore<ScheduleView>("pk_schedule_view", { onlyMine: false, watching: true, planning: true });
export const useScheduleView = viewStore.useValue;
export const updateScheduleView = (changes: Partial<ScheduleView>) => viewStore.set({ ...viewStore.get(), ...changes });

export function matchesView(mine: MyEntry | undefined, view: ScheduleView) {
  if (!view.onlyMine) return true;
  return (mine?.status === "watching" && view.watching) || (mine?.status === "planning" && view.planning);
}
