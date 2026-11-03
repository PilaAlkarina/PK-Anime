/**
 * Normalized catalog types. Views and API routes only see these, never raw AniList JSON.
 */

export type MediaSeason = "WINTER" | "SPRING" | "SUMMER" | "FALL";
export type MediaStatus = "FINISHED" | "RELEASING" | "NOT_YET_RELEASED" | "CANCELLED" | "HIATUS";

export interface AiringEpisode {
  episode: number;
  /** Unix time in seconds, as AniList returns it */
  airingAt: number;
}

export interface CatalogItem {
  id: number;
  malId: number | null;
  title: string;
  romajiTitle: string | null;
  cover: string | null;
  /** Dominant cover color (#rrggbb), used to tint backgrounds */
  color: string | null;
  banner: string | null;
  format: string | null;
  status: MediaStatus | null;
  episodes: number | null;
  /** Episodes already out: aired ones while releasing, the total once finished */
  availableEpisodes: number | null;
  /** 0–100 */
  score: number | null;
  season: MediaSeason | null;
  seasonYear: number | null;
  genres: string[];
  nextEpisode: AiringEpisode | null;
  /** Only on "latest episodes" rows: the episode that just aired */
  airedEpisode?: AiringEpisode;
}

export const ROW_KINDS = [
  "trending",
  "season",
  "next-season",
  "top-rated",
  "airing",
  "upcoming",
  "latest",
  "genre",
  "tag",
  "search",
  "filter",
] as const;
export type RowKind = (typeof ROW_KINDS)[number];

export interface CatalogRow {
  /** Stable key, e.g. "trending" or "genre:Action" */
  id: string;
  kind: RowKind;
  value?: string;
  title: string;
  items: CatalogItem[];
  page: number;
  hasNextPage: boolean;
}

export interface AnimeRelation {
  relationType: string;
  item: CatalogItem;
}

export interface StreamingEpisode {
  title: string;
  thumbnail: string | null;
}

export interface AnimeDetail extends CatalogItem {
  englishTitle: string | null;
  nativeTitle: string | null;
  description: string;
  duration: number | null;
  studios: string[];
  tags: string[];
  trailer: { id: string; site: string } | null;
  startDate: { year: number | null; month: number | null; day: number | null };
  relations: AnimeRelation[];
  recommendations: CatalogItem[];
  streamingEpisodes: StreamingEpisode[];
}

export interface ScheduleEntry extends AiringEpisode {
  anime: CatalogItem;
}

export interface Genre {
  name: string;
  label: string;
}

/** Community tag (AniList), e.g. "Isekai" in the "Theme-Fantasy" category */
export interface Tag {
  name: string;
  description: string;
  category: string;
}
