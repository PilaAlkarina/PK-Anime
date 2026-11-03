import { unstable_cache } from "next/cache";
import { anilistQuery, AniListError } from "./client";
import { buildRowsQuery, DETAIL_QUERY, GENRES_QUERY, SCHEDULE_QUERY, type RowSource } from "./queries";
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

export const GENRE_LABELS: Record<string, string> = {
  Action: "Acción",
  Adventure: "Aventura",
  Comedy: "Comedia",
  Drama: "Drama",
  Ecchi: "Ecchi",
  Fantasy: "Fantasía",
  Horror: "Terror",
  "Mahou Shoujo": "Mahou shoujo",
  Mecha: "Mecha",
  Music: "Música",
  Mystery: "Misterio",
  Psychological: "Psicológico",
  Romance: "Romance",
  "Sci-Fi": "Ciencia ficción",
  "Slice of Life": "Recuentos de la vida",
  Sports: "Deportes",
  Supernatural: "Sobrenatural",
  Thriller: "Suspense",
};

const HIDDEN_GENRES = new Set(["Hentai"]);

interface RawCard {
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
      trailer: media.trailer,
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
    };
  },
  ["anilist:anime"],
  { revalidate: DETAIL_TTL, tags: ["anilist"] }
);

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
