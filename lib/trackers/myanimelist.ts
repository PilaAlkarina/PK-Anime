import { TrackerError, type ListStatus, type Tracker, type TrackerEntry, type TrackerIds } from "./types";

const MAL_API = "https://api.myanimelist.net/v2";
// The list endpoint allows up to 1000 entries per page; five pages cover very large lists
const LIST_PAGE_SIZE = 1000;
const MAX_LIST_PAGES = 5;

const TO_STATUS: Record<string, ListStatus> = {
  watching: "watching",
  plan_to_watch: "planning",
  completed: "completed",
  on_hold: "paused",
  dropped: "dropped",
};

const FROM_STATUS: Record<ListStatus, string> = {
  watching: "watching",
  planning: "plan_to_watch",
  completed: "completed",
  paused: "on_hold",
  dropped: "dropped",
};

interface MalListStatus {
  status: string;
  score?: number;
  num_episodes_watched?: number;
  is_rewatching?: boolean;
  updated_at?: string;
  finish_date?: string;
}

function toEntry(malId: number, listStatus: MalListStatus): TrackerEntry {
  return {
    anilistId: null,
    malId,
    status: TO_STATUS[listStatus.status] ?? "planning",
    progress: listStatus.num_episodes_watched ?? 0,
    score: listStatus.score || null,
    rewatching: !!listStatus.is_rewatching,
    updatedAt: listStatus.updated_at ? Date.parse(listStatus.updated_at) : null,
    finishedAt: listStatus.finish_date || null,
  };
}

async function malFetch<T>(token: string, url: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(url.startsWith("http") ? url : `${MAL_API}${url}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, ...init.headers },
    cache: "no-store",
  });
  if (!res.ok) throw new TrackerError(`MyAnimeList answered ${res.status}`, res.status);
  return res.json() as Promise<T>;
}

function requireMalId(ids: TrackerIds) {
  if (!ids.malId) throw new TrackerError("This anime has no MyAnimeList ID", 404);
  return ids.malId;
}

async function getAnimeState(token: string, malId: number) {
  const anime = await malFetch<{ num_episodes?: number; my_list_status?: MalListStatus }>(
    token,
    `/anime/${malId}?fields=num_episodes,my_list_status`
  );
  return { total: anime.num_episodes || 0, entry: anime.my_list_status ? toEntry(malId, anime.my_list_status) : null };
}

async function updateListStatus(token: string, malId: number, fields: Record<string, string>) {
  const listStatus = await malFetch<MalListStatus>(token, `/anime/${malId}/my_list_status`, {
    method: "PATCH",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(fields),
  });
  return toEntry(malId, listStatus);
}

export const myAnimeList: Tracker = {
  id: "myanimelist",
  name: "MyAnimeList",
  idKind: "mal",

  async getList(token) {
    const entries: TrackerEntry[] = [];
    let url: string | undefined = `/users/@me/animelist?fields=list_status&limit=${LIST_PAGE_SIZE}&nsfw=true`;
    for (let page = 0; url && page < MAX_LIST_PAGES; page++) {
      const data: {
        data: { node: { id: number }; list_status: MalListStatus }[];
        paging?: { next?: string };
      } = await malFetch(token, url);
      for (const item of data.data) entries.push(toEntry(item.node.id, item.list_status));
      url = data.paging?.next;
    }
    return { entries };
  },

  async getEntry(token, ids) {
    return (await getAnimeState(token, requireMalId(ids))).entry;
  },

  async saveProgress(token, ids, episode) {
    const malId = requireMalId(ids);
    const { total, entry } = await getAnimeState(token, malId);
    // Rewatching an earlier episode leaves the list alone
    if (entry && entry.progress >= episode) return { updated: false, entry };
    const status = total && episode >= total ? "completed" : "watching";
    return {
      updated: true,
      entry: await updateListStatus(token, malId, { status, num_watched_episodes: String(episode) }),
    };
  },

  async addToPlanning(token, ids) {
    const malId = requireMalId(ids);
    const { entry } = await getAnimeState(token, malId);
    if (entry) return { added: false, entry };
    return { added: true, entry: await updateListStatus(token, malId, { status: "plan_to_watch" }) };
  },

  async updateEntry(token, ids, { status, score, progress }) {
    const malId = requireMalId(ids);
    const fields: Record<string, string> = {};
    if (status) fields.status = FROM_STATUS[status];
    if (score !== undefined) fields.score = String(score ?? 0);
    if (progress !== undefined) fields.num_watched_episodes = String(progress);
    // MAL leaves the episode count alone when an anime is marked completed
    if (status === "completed") {
      const { total } = await getAnimeState(token, malId);
      if (total) fields.num_watched_episodes = String(total);
    }
    return updateListStatus(token, malId, fields);
  },

  async removeEntry(token, ids) {
    const res = await fetch(`${MAL_API}/anime/${requireMalId(ids)}/my_list_status`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    // 404: it wasn't on the list
    if (!res.ok && res.status !== 404) throw new TrackerError(`MyAnimeList answered ${res.status}`, res.status);
  },
};
