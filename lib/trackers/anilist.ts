import { anilistQuery, AniListError } from "@/lib/anilist/client";
import { cardFromMedia, type RawCard } from "@/lib/anilist/catalog";
import { CARD_FRAGMENT } from "@/lib/anilist/queries";
import type { CatalogItem } from "@/lib/anilist/types";
import { TrackerError, type ListStatus, type Tracker, type TrackerEntry, type TrackerIds } from "./types";

// AniList splits big lists into chunks of at most 500 entries
const CHUNK_SIZE = 500;
const MAX_CHUNKS = 10;

type AniListStatus = "CURRENT" | "PLANNING" | "COMPLETED" | "PAUSED" | "DROPPED" | "REPEATING";

const TO_STATUS: Record<AniListStatus, ListStatus> = {
  CURRENT: "watching",
  REPEATING: "watching",
  PLANNING: "planning",
  COMPLETED: "completed",
  PAUSED: "paused",
  DROPPED: "dropped",
};

const FROM_STATUS: Record<ListStatus, AniListStatus> = {
  watching: "CURRENT",
  planning: "PLANNING",
  completed: "COMPLETED",
  paused: "PAUSED",
  dropped: "DROPPED",
};

// Scores are read on a 0–100 scale whatever format the user picked, so 0–10 maps cleanly
const ENTRY_FIELDS = `id status progress updatedAt score(format: POINT_100) media { id idMal episodes }`;

interface RawEntry {
  id: number;
  status: AniListStatus;
  progress: number | null;
  updatedAt: number | null;
  score: number | null;
  media: { id: number; idMal: number | null; episodes: number | null };
}

function toEntry(raw: RawEntry): TrackerEntry {
  return {
    anilistId: raw.media.id,
    malId: raw.media.idMal || null,
    status: TO_STATUS[raw.status] ?? "planning",
    progress: raw.progress ?? 0,
    score: raw.score ? Math.round(raw.score / 10) || null : null,
    rewatching: raw.status === "REPEATING",
    // AniList sends Unix seconds
    updatedAt: raw.updatedAt ? raw.updatedAt * 1000 : null,
  };
}

async function query<T>(token: string, text: string, variables: Record<string, unknown> = {}) {
  try {
    return await anilistQuery<T>(text, variables, { token, timeoutMs: 15000 });
  } catch (err) {
    throw err instanceof AniListError ? new TrackerError(err.message, err.status) : err;
  }
}

function requireAnilistId(ids: TrackerIds) {
  if (!ids.anilistId) throw new TrackerError("This anime has no AniList ID", 404);
  return ids.anilistId;
}

async function getMediaState(token: string, mediaId: number) {
  const { Media } = await query<{ Media: { episodes: number | null; mediaListEntry: RawEntry | null } | null }>(
    token,
    `query ($id: Int) { Media(id: $id, type: ANIME) { episodes mediaListEntry { ${ENTRY_FIELDS} } } }`,
    { id: mediaId }
  );
  if (!Media) throw new TrackerError("AniList doesn't know this anime", 404);
  return { total: Media.episodes || 0, raw: Media.mediaListEntry };
}

async function saveEntry(token: string, variables: Record<string, unknown>) {
  const { SaveMediaListEntry } = await query<{ SaveMediaListEntry: RawEntry }>(
    token,
    `mutation ($mediaId: Int, $status: MediaListStatus, $progress: Int, $scoreRaw: Int) {
      SaveMediaListEntry(mediaId: $mediaId, status: $status, progress: $progress, scoreRaw: $scoreRaw) { ${ENTRY_FIELDS} }
    }`,
    variables
  );
  return toEntry(SaveMediaListEntry);
}

export const aniList: Tracker = {
  id: "anilist",
  name: "AniList",
  idKind: "anilist",

  async getList(token) {
    const { Viewer } = await query<{ Viewer: { id: number } }>(token, `query { Viewer { id } }`);
    const entries = new Map<number, TrackerEntry>();
    const cards = new Map<number, CatalogItem>();

    for (let chunk = 1; chunk <= MAX_CHUNKS; chunk++) {
      const { MediaListCollection } = await query<{
        MediaListCollection: {
          hasNextChunk: boolean;
          lists: { entries: (RawEntry & { media: RawEntry["media"] & RawCard })[] }[];
        };
      }>(
        token,
        `query ($userId: Int, $chunk: Int, $perChunk: Int) {
          MediaListCollection(userId: $userId, type: ANIME, chunk: $chunk, perChunk: $perChunk) {
            hasNextChunk
            lists { entries { id status progress updatedAt score(format: POINT_100) media { ...card } } }
          }
        }
        ${CARD_FRAGMENT}`,
        { userId: Viewer.id, chunk, perChunk: CHUNK_SIZE }
      );
      // Custom lists repeat entries already in the status lists
      for (const list of MediaListCollection.lists) {
        for (const raw of list.entries) {
          if (entries.has(raw.id)) continue;
          entries.set(raw.id, toEntry(raw));
          const card = cardFromMedia(raw.media);
          if (card) cards.set(card.id, card);
        }
      }
      if (!MediaListCollection.hasNextChunk) break;
    }

    return { entries: Array.from(entries.values()), cards: Array.from(cards.values()) };
  },

  async getEntry(token, ids) {
    const { raw } = await getMediaState(token, requireAnilistId(ids));
    return raw ? toEntry(raw) : null;
  },

  async saveProgress(token, ids, episode) {
    const mediaId = requireAnilistId(ids);
    const { total, raw } = await getMediaState(token, mediaId);
    const entry = raw ? toEntry(raw) : null;
    // Rewatching an earlier episode leaves the list alone
    if (entry && entry.progress >= episode) return { updated: false, entry };
    const finished = !!total && episode >= total;
    const status: AniListStatus = finished ? "COMPLETED" : raw?.status === "REPEATING" ? "REPEATING" : "CURRENT";
    return { updated: true, entry: await saveEntry(token, { mediaId, status, progress: episode }) };
  },

  async addToPlanning(token, ids) {
    const mediaId = requireAnilistId(ids);
    const { raw } = await getMediaState(token, mediaId);
    if (raw) return { added: false, entry: toEntry(raw) };
    return { added: true, entry: await saveEntry(token, { mediaId, status: "PLANNING" }) };
  },

  async updateEntry(token, ids, { status, score }) {
    const mediaId = requireAnilistId(ids);
    const variables: Record<string, unknown> = { mediaId };
    if (status) variables.status = FROM_STATUS[status];
    if (score !== undefined) variables.scoreRaw = (score ?? 0) * 10;
    // Like on MAL, marking an anime completed counts every episode as watched
    if (status === "completed") {
      const { total } = await getMediaState(token, mediaId);
      if (total) variables.progress = total;
    }
    return saveEntry(token, variables);
  },

  async removeEntry(token, ids) {
    const { raw } = await getMediaState(token, requireAnilistId(ids));
    if (!raw) return;
    await query(token, `mutation ($id: Int) { DeleteMediaListEntry(id: $id) { deleted } }`, { id: raw.id });
  },
};
