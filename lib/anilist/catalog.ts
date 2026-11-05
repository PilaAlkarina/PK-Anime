import { cache } from "react";
import { unstable_cache } from "next/cache";
import { anilistQuery, AniListError } from "./client";
import { BY_MAL_IDS_QUERY, buildRowsQuery, DESCRIPTIONS_QUERY, DETAIL_QUERY, FRESH_CARDS_QUERY, GENRES_QUERY, SCHEDULE_QUERY, SEQUELS_QUERY, TAGS_QUERY, type RowSource } from "./queries";
import { parseFilters } from "./filters";
import { cleanTrailer } from "./trailer";
import { aniZipEpisodesOrNone } from "./anizip";
import { GENRE_LABELS, HIDDEN_GENRES } from "./genres";
import { getCurrentSeason, getNextSeason, SEASON_LABELS } from "./season";
import type {
  AiringEpisode,
  AnimeDetail,
  CatalogItem,
  CatalogRow,
  Genre,
  MediaSeason,
  MediaStatus,
  RowKind,
  ScheduleEntry,
  Tag,
} from "./types";

const PER_PAGE = 20;
export const MAX_ROW_PAGE = 50;
const MAX_SCHEDULE_PAGES = 6;

// Every AniList call goes through unstable_cache, so TVs never hit AniList directly and the
// 90 requests/minute limit is shared by the server, not spent per viewer
const ROW_TTL = 15 * 60;
const DETAIL_TTL = 6 * 60 * 60;
const SCHEDULE_TTL = 30 * 60;
const GENRES_TTL = 24 * 60 * 60;

export const HOME_GENRES = ["Action", "Comedy", "Fantasy"];

const HOME_ROWS: { kind: RowKind; value?: string }[] = [
  { kind: "trending" },
  { kind: "season" },
  { kind: "latest" },
  { kind: "top-rated" },
  { kind: "upcoming" },
  ...HOME_GENRES.map((value) => ({ kind: "genre" as const, value })),
];

/** A Media object fetched with CARD_FRAGMENT */
export interface RawCard {
  id: number;
  idMal: number | null;
  type: "ANIME" | "MANGA";
  isAdult: boolean;
  title: { english: string | null; romaji: string | null; native?: string | null };
  coverImage: { large: string | null; color: string | null } | null;
  bannerImage: string | null;
  format: string | null;
  status: MediaStatus | null;
  episodes: number | null;
  averageScore: number | null;
  season: MediaSeason | null;
  seasonYear: number | null;
  genres: string[] | null;
  nextAiringEpisode: AiringEpisode | null;
}

interface RawPage {
  pageInfo: { hasNextPage: boolean };
  media?: RawCard[];
  airingSchedules?: { episode: number; airingAt: number; media: RawCard | null }[];
}

interface RawDetail extends RawCard {
  description: string | null;
  duration: number | null;
  startDate: { year: number | null; month: number | null; day: number | null } | null;
  studios: { nodes: { name: string }[] } | null;
  tags: { name: string; isMediaSpoiler: boolean; isAdult: boolean }[] | null;
  trailer: { id: string; site: string } | null;
  streamingEpisodes: { title: string | null; thumbnail: string | null }[] | null;
  airingSchedule: { nodes: (AiringEpisode | null)[] } | null;
  relations: { edges: { relationType: string; node: RawCard | null }[] } | null;
  recommendations: { nodes: { mediaRecommendation: RawCard | null }[] } | null;
}

const isListable = (m: RawCard | null | undefined): m is RawCard => !!m && m.type === "ANIME" && !m.isAdult;

function availableEpisodes(m: RawCard) {
  if (m.status === "NOT_YET_RELEASED") return 0;
  if (m.nextAiringEpisode) return Math.max(0, m.nextAiringEpisode.episode - 1);
  return m.episodes ?? null;
}

function toCatalogItem(m: RawCard): CatalogItem {
  return {
    id: m.id,
    malId: m.idMal || null,
    title: m.title.english || m.title.romaji || `Anime ${m.id}`,
    romajiTitle: m.title.romaji,
    cover: m.coverImage?.large || null,
    color: m.coverImage?.color || null,
    banner: m.bannerImage,
    format: m.format,
    status: m.status,
    episodes: m.episodes,
    availableEpisodes: availableEpisodes(m),
    score: m.averageScore,
    season: m.season,
    seasonYear: m.seasonYear,
    genres: (m.genres || []).filter((g) => !HIDDEN_GENRES.has(g)),
    nextEpisode: m.nextAiringEpisode,
  };
}

/** Catalog card for a Media fetched elsewhere with CARD_FRAGMENT; null for manga and adult titles */
export function cardFromMedia(m: RawCard | null | undefined): CatalogItem | null {
  return isListable(m) ? toCatalogItem(m) : null;
}

/** AniList descriptions carry <br>, <i> and HTML entities even with asHtml: false */
function cleanDescription(text: string | null) {
  return (text || "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function describeRow(kind: RowKind, value: string | undefined, now: Date): { title: string; source: RowSource } {
  switch (kind) {
    case "trending":
      return { title: "Tendencias", source: { type: "media", sort: "TRENDING_DESC" } };
    case "season": {
      const { season, year } = getCurrentSeason(now);
      return {
        title: `Temporada de ${SEASON_LABELS[season].toLowerCase()} ${year}`,
        source: { type: "media", sort: "POPULARITY_DESC", season, seasonYear: year },
      };
    }
    case "next-season": {
      const { season, year } = getNextSeason(now);
      return {
        title: `Próxima temporada: ${SEASON_LABELS[season].toLowerCase()} ${year}`,
        source: { type: "media", sort: "POPULARITY_DESC", season, seasonYear: year },
      };
    }
    case "top-rated":
      return { title: "Mejor valorados", source: { type: "media", sort: "SCORE_DESC" } };
    case "airing":
      return { title: "En emisión", source: { type: "media", sort: "POPULARITY_DESC", status: "RELEASING" } };
    case "upcoming":
      return {
        title: "Próximos estrenos",
        source: { type: "media", sort: "POPULARITY_DESC", status: "NOT_YET_RELEASED" },
      };
    case "latest":
      return { title: "Últimos episodios", source: { type: "airing", before: Math.floor(now.getTime() / 1000) } };
    case "genre":
      return {
        title: GENRE_LABELS[value || ""] || value || "",
        source: { type: "media", sort: "POPULARITY_DESC", genre: value },
      };
    case "tag":
      return { title: value || "", source: { type: "media", sort: "POPULARITY_DESC", tag: value } };
    case "search":
      return {
        title: `Resultados para «${value || ""}»`,
        source: { type: "media", sort: "SEARCH_MATCH", search: value },
      };
    case "filter": {
      const filters = parseFilters(new URLSearchParams(value || ""));
      return {
        title: filters.q ? `Resultados para «${filters.q}»` : "Resultados",
        source: { type: "filter", filters },
      };
    }
  }
}

function toRow(kind: RowKind, value: string | undefined, title: string, page: number, raw: RawPage | null): CatalogRow {
  let items: CatalogItem[];
  if (raw?.airingSchedules) {
    // Batch releases put several episodes of one show next to each other; keep the newest
    const seen = new Set<number>();
    items = [];
    for (const s of raw.airingSchedules) {
      if (!isListable(s.media) || seen.has(s.media.id)) continue;
      seen.add(s.media.id);
      items.push({ ...toCatalogItem(s.media), airedEpisode: { episode: s.episode, airingAt: s.airingAt } });
    }
  } else {
    items = (raw?.media || []).filter(isListable).map(toCatalogItem);
  }
  return {
    id: value ? `${kind}:${value}` : kind,
    kind,
    ...(value ? { value } : {}),
    title,
    items,
    page,
    hasNextPage: raw?.pageInfo.hasNextPage ?? false,
  };
}

async function fetchRows(defs: { kind: RowKind; value?: string }[], page: number) {
  const now = new Date();
  const described = defs.map((d) => ({ ...d, ...describeRow(d.kind, d.value, now) }));
  const { query, variables } = buildRowsQuery(
    described.map((d) => d.source),
    page,
    PER_PAGE
  );
  const data = await anilistQuery<Record<string, RawPage | null>>(query, variables);
  return described.map((d, i) => toRow(d.kind, d.value, d.title, page, data[`r${i}`]));
}

/** Rows for the home screen, fetched in a single AniList request. Empty rows are dropped. */
export const getHomeRows = unstable_cache(
  async (): Promise<CatalogRow[]> => (await fetchRows(HOME_ROWS, 1)).filter((row) => row.items.length > 0),
  ["anilist:home"],
  { revalidate: ROW_TTL, tags: ["anilist"] }
);

/** One page of a single row, for loading more items as the user scrolls along it */
export const getRow = unstable_cache(
  async (kind: RowKind, value: string | undefined, page: number): Promise<CatalogRow> =>
    (await fetchRows([{ kind, value }], page))[0],
  ["anilist:row"],
  { revalidate: ROW_TTL, tags: ["anilist"] }
);

/** Full details for one anime, or null when AniList has no anime with that ID */
export const getAnime = unstable_cache(
  async (id: number): Promise<AnimeDetail | null> => {
    let media: RawDetail | null;
    try {
      media = (await anilistQuery<{ Media: RawDetail | null }>(DETAIL_QUERY, { id })).Media;
    } catch (err) {
      if (err instanceof AniListError && err.status === 404) return null;
      throw err;
    }
    if (!isListable(media)) return null;

    return {
      ...toCatalogItem(media),
      englishTitle: media.title.english,
      nativeTitle: media.title.native ?? null,
      description: cleanDescription(media.description),
      duration: media.duration,
      studios: (media.studios?.nodes || []).map((s) => s.name),
      tags: (media.tags || [])
        .filter((t) => !t.isMediaSpoiler && !t.isAdult)
        .slice(0, 8)
        .map((t) => t.name),
      trailer: cleanTrailer(media.trailer),
      startDate: media.startDate || { year: null, month: null, day: null },
      relations: (media.relations?.edges || [])
        .filter((e) => isListable(e.node))
        .map((e) => ({ relationType: e.relationType, item: toCatalogItem(e.node!) })),
      recommendations: (media.recommendations?.nodes || [])
        .map((n) => n.mediaRecommendation)
        .filter(isListable)
        .map(toCatalogItem),
      streamingEpisodes: (media.streamingEpisodes || []).map((e) => ({
        title: e.title || "",
        thumbnail: e.thumbnail,
      })),
      upcomingAirings: (media.airingSchedule?.nodes || []).filter((n): n is AiringEpisode => !!n),
      episodeDetails: [],
    };
  },
  // v2: details now carry the airing schedule
  ["anilist:anime:v2"],
  { revalidate: DETAIL_TTL, tags: ["anilist"] }
);

/**
 * getAnime plus ani.zip's episode titles and thumbnails, for the anime page and the player. Each
 * source is cached on its own, so ani.zip being down only leaves the episodes without art.
 *
 * Memoized per request with React's cache(): the page and its generateMetadata both load it and
 * run in the same render, and unstable_cache doesn't merge concurrent calls, so without it a cold
 * or stale entry was fetched twice.
 */
export const getAnimeWithEpisodes = cache(async (id: number): Promise<AnimeDetail | null> => {
  const [anime, episodeDetails] = await Promise.all([getAnime(id), aniZipEpisodesOrNone(id)]);
  return anime && { ...anime, episodeDetails };
});

/** Episodes airing between two Unix timestamps (seconds), oldest first */
export const getSchedule = unstable_cache(
  async (from: number, to: number): Promise<ScheduleEntry[]> => {
    const entries: ScheduleEntry[] = [];
    for (let page = 1; page <= MAX_SCHEDULE_PAGES; page++) {
      const { Page } = await anilistQuery<{ Page: RawPage }>(SCHEDULE_QUERY, { page, from, to });
      for (const s of Page.airingSchedules || []) {
        if (isListable(s.media)) {
          entries.push({ episode: s.episode, airingAt: s.airingAt, anime: toCatalogItem(s.media) });
        }
      }
      if (!Page.pageInfo.hasNextPage) break;
    }
    return entries;
  },
  ["anilist:schedule"],
  { revalidate: SCHEDULE_TTL, tags: ["anilist"] }
);

export const getGenres = unstable_cache(
  async (): Promise<Genre[]> => {
    const { GenreCollection } = await anilistQuery<{ GenreCollection: string[] }>(GENRES_QUERY);
    return GenreCollection.filter((name) => !HIDDEN_GENRES.has(name)).map((name) => ({
      name,
      label: GENRE_LABELS[name] || name,
    }));
  },
  ["anilist:genres"],
  { revalidate: GENRES_TTL, tags: ["anilist"] }
);

/** Community tags allowed in the library (adult ones are left out), by category then name */
export const getTags = unstable_cache(
  async (): Promise<Tag[]> => {
    const { MediaTagCollection } = await anilistQuery<{
      MediaTagCollection: { name: string; description: string | null; category: string | null; isAdult: boolean }[];
    }>(TAGS_QUERY);
    return MediaTagCollection.filter((t) => !t.isAdult)
      .map((t) => ({ name: t.name, description: t.description || "", category: t.category || "Other" }))
      .sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name));
  },
  ["anilist:tags"],
  { revalidate: GENRES_TTL, tags: ["anilist"] }
);

interface RawSequels extends RawCard {
  startDate: { year: number | null; month: number | null; day: number | null } | null;
  relations: { edges: { relationType: string; node: { id: number; type: string } | null }[] } | null;
}

interface SequelLinks {
  card: CatalogItem;
  /** Release date as YYYYMMDD, for the order */
  start: number;
  /** Prequels and sequels */
  linked: number[];
}

const SEQUELS_CHUNK = 50;
const SEQUELS_TTL_MS = DETAIL_TTL * 1000;
// Each anime's links, kept in memory as long as the details: every entry of a franchise reuses them
const sequelCache = new Map<number, { links: SequelLinks | null; expires: number }>();

function toSequelLinks(media: RawSequels): SequelLinks {
  const d = media.startDate;
  return {
    card: toCatalogItem(media),
    // YYYYMMDD with unknown parts as 99, so an undated entry sorts after the dated ones of its year
    start: d?.year ? d.year * 10000 + (d.month ?? 99) * 100 + (d.day ?? 99) : 99999999,
    linked: (media.relations?.edges || [])
      .filter((e) => (e.relationType === "PREQUEL" || e.relationType === "SEQUEL") && e.node?.type === "ANIME")
      .map((e) => e.node!.id),
  };
}

/** Prequels and sequels of several anime, 50 per request (null for one AniList doesn't list) */
async function getSequelLinks(ids: number[]): Promise<Map<number, SequelLinks | null>> {
  const now = Date.now();
  const missing = ids.filter((id) => (sequelCache.get(id)?.expires ?? 0) <= now);
  for (let i = 0; i < missing.length; i += SEQUELS_CHUNK) {
    const chunk = missing.slice(i, i + SEQUELS_CHUNK);
    const { Page } = await anilistQuery<{ Page: { media: RawSequels[] | null } }>(SEQUELS_QUERY, { ids: chunk });
    const found = new Map((Page.media || []).filter(isListable).map((m) => [m.id, toSequelLinks(m)]));
    for (const id of chunk) sequelCache.set(id, { links: found.get(id) ?? null, expires: now + SEQUELS_TTL_MS });
  }
  if (sequelCache.size > MAL_CARD_CACHE_MAX) {
    for (const [id, entry] of sequelCache) if (entry.expires <= now) sequelCache.delete(id);
  }
  return new Map(ids.map((id) => [id, sequelCache.get(id)?.links ?? null]));
}

const MAX_FRANCHISE = 24;

/**
 * Every season, film and OVA reachable from an anime through prequels and sequels, in release
 * order: the franchise's watch order. Side stories and spin-offs stay out. Empty when the anime
 * stands alone.
 *
 * Walked a level at a time, each level in one request, where it used to be one request per
 * entry, one after another (up to 24 for a long franchise).
 */
export async function getWatchOrder(id: number): Promise<CatalogItem[]> {
  const found = new Map<number, { card: CatalogItem; start: number }>();
  const queued = new Set([id]);
  let level = [id];
  while (level.length > 0 && found.size < MAX_FRANCHISE) {
    const links = await getSequelLinks(level);
    const next: number[] = [];
    for (const current of level) {
      const entry = links.get(current);
      if (!entry || found.size >= MAX_FRANCHISE) continue;
      found.set(current, { card: entry.card, start: entry.start });
      for (const linked of entry.linked) {
        if (!queued.has(linked)) {
          queued.add(linked);
          next.push(linked);
        }
      }
    }
    level = next;
  }
  if (found.size < 2) return [];
  return Array.from(found.values())
    .sort((a, b) => a.start - b.start || a.card.id - b.card.id)
    .map((f) => f.card);
}

/** How far back an aired episode still counts as new */
const NEW_EPISODE_WINDOW_S = 21 * 24 * 60 * 60;
const FRESH_TTL_MS = 10 * 60 * 1000;
const FRESH_CHUNK = 50;
const freshCache = new Map<number, { card: CatalogItem | null; expires: number }>();

/**
 * Up-to-date cards for AniList IDs (lists and the watch history keep old copies). A show that
 * aired an episode in the last three weeks has it in `airedEpisode`. Cached per ID for ten
 * minutes, so each anime is asked for once however many lists it is on.
 */
export async function getFreshCards(ids: number[]): Promise<CatalogItem[]> {
  const now = Date.now();
  const unique = Array.from(new Set(ids)).sort((a, b) => a - b);
  const missing = unique.filter((id) => (freshCache.get(id)?.expires ?? 0) <= now);

  for (let i = 0; i < missing.length; i += FRESH_CHUNK) {
    const chunk = missing.slice(i, i + FRESH_CHUNK);
    const data = await anilistQuery<{
      cards: RawPage;
      aired: { airingSchedules: { mediaId: number; episode: number; airingAt: number }[] | null };
    }>(FRESH_CARDS_QUERY, { ids: chunk, since: Math.floor(now / 1000) - NEW_EPISODE_WINDOW_S });
    const latest = new Map<number, AiringEpisode>();
    for (const s of data.aired.airingSchedules || []) {
      const known = latest.get(s.mediaId);
      if (!known || s.episode > known.episode) latest.set(s.mediaId, { episode: s.episode, airingAt: s.airingAt });
    }
    const found = new Map<number, CatalogItem>();
    for (const m of data.cards.media || []) {
      if (!isListable(m)) continue;
      const aired = latest.get(m.id);
      found.set(m.id, aired ? { ...toCatalogItem(m), airedEpisode: aired } : toCatalogItem(m));
    }
    for (const id of chunk) freshCache.set(id, { card: found.get(id) ?? null, expires: now + FRESH_TTL_MS });
  }
  const cards = unique.map((id) => freshCache.get(id)?.card).filter((c): c is CatalogItem => !!c);
  if (freshCache.size > MAL_CARD_CACHE_MAX) freshCache.clear();
  return cards;
}

const DESCRIPTION_CHUNK = 50;
const DESCRIPTION_TTL_MS = DETAIL_TTL * 1000;
const descriptionCache = new Map<number, { text: string; expires: number }>();

/**
 * Synopses by AniList ID, 50 per request, kept in memory as long as the details: the home hero
 * needs only this, where it used to load each title's whole detail record. IDs AniList doesn't
 * have come back with an empty text, so they aren't asked for again.
 */
export async function getDescriptions(ids: number[]): Promise<Record<number, string>> {
  const now = Date.now();
  const unique = Array.from(new Set(ids));
  const missing = unique.filter((id) => (descriptionCache.get(id)?.expires ?? 0) <= now);
  for (let i = 0; i < missing.length; i += DESCRIPTION_CHUNK) {
    const chunk = missing.slice(i, i + DESCRIPTION_CHUNK);
    const { Page } = await anilistQuery<{ Page: { media: { id: number; description: string | null }[] | null } }>(
      DESCRIPTIONS_QUERY,
      { ids: chunk }
    );
    const found = new Map((Page.media || []).map((m) => [m.id, cleanDescription(m.description)]));
    for (const id of chunk) descriptionCache.set(id, { text: found.get(id) ?? "", expires: now + DESCRIPTION_TTL_MS });
  }
  if (descriptionCache.size > MAL_CARD_CACHE_MAX) {
    for (const [id, entry] of descriptionCache) if (entry.expires <= now) descriptionCache.delete(id);
  }
  return Object.fromEntries(unique.map((id) => [id, descriptionCache.get(id)?.text ?? ""]));
}

/** AniList allows 50 IDs per idMal_in page */
const MAL_ID_CHUNK = 50;

const getCardsByMalIdChunk = unstable_cache(
  async (malIds: number[]): Promise<CatalogItem[]> => {
    const { Page } = await anilistQuery<{ Page: RawPage }>(BY_MAL_IDS_QUERY, { ids: malIds });
    return (Page.media || []).filter(isListable).map(toCatalogItem);
  },
  ["anilist:by-mal"],
  { revalidate: DETAIL_TTL, tags: ["anilist"] }
);

// Cards by MAL ID (null: AniList has nothing listable for it). Chunks are cached by their exact
// IDs, so one anime added to a list would shift every later chunk; this per-ID layer means only
// the new IDs are looked up.
const malCardCache = new Map<number, { card: CatalogItem | null; expires: number }>();
const MAL_CARD_CACHE_MAX = 20_000;

/** Catalog cards for MyAnimeList IDs, keyed by MAL ID; IDs AniList doesn't know are left out */
export async function getCardsByMalIds(malIds: number[]): Promise<Map<number, CatalogItem>> {
  const now = Date.now();
  const unique = Array.from(new Set(malIds)).sort((a, b) => a - b);
  const cards = new Map<number, CatalogItem>();
  const missing: number[] = [];
  for (const id of unique) {
    const cached = malCardCache.get(id);
    if (!cached || cached.expires < now) missing.push(id);
    else if (cached.card) cards.set(id, cached.card);
  }

  // One chunk at a time, to stay well inside AniList's rate limit on a cold cache
  const expires = now + DETAIL_TTL * 1000;
  for (let i = 0; i < missing.length; i += MAL_ID_CHUNK) {
    const chunk = missing.slice(i, i + MAL_ID_CHUNK);
    const found = new Map<number, CatalogItem>();
    for (const card of await getCardsByMalIdChunk(chunk)) if (card.malId) found.set(card.malId, card);
    for (const id of chunk) {
      const card = found.get(id) ?? null;
      malCardCache.set(id, { card, expires });
      if (card) cards.set(id, card);
    }
  }
  if (malCardCache.size > MAL_CARD_CACHE_MAX) malCardCache.clear();
  return cards;
}
