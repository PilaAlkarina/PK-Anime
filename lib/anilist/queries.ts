import type { MediaSeason, MediaStatus } from "./types";
import { effectiveSort, lengthRange, type CatalogFilters } from "./filters";

export type MediaSort = "TRENDING_DESC" | "POPULARITY_DESC" | "SCORE_DESC" | "SEARCH_MATCH";

/** Where a row's items come from: a filtered Media page, or the recent airing schedule */
export type RowSource =
  | {
      type: "media";
      sort: MediaSort;
      season?: MediaSeason;
      seasonYear?: number;
      status?: MediaStatus;
      genre?: string;
      tag?: string;
      search?: string;
    }
  | { type: "airing"; before: number }
  /** Advanced search; every value was validated by parseFilters */
  | { type: "filter"; filters: CatalogFilters };

export const CARD_FRAGMENT = `
fragment card on Media {
  id idMal type isAdult
  title { english romaji }
  coverImage { large color }
  bannerImage format status episodes averageScore season seasonYear genres
  nextAiringEpisode { episode airingAt }
}`;

/**
 * One query with an aliased Page per row (r0, r1, …), so a whole screen of rows costs a
 * single request. Enums come from our own row definitions and go inline; strings (genre,
 * tag, search) can come from the URL, so they go through variables.
 */
export function buildRowsQuery(sources: RowSource[], page: number, perPage: number) {
  const declarations = ["$page: Int", "$perPage: Int"];
  const variables: Record<string, unknown> = { page, perPage };

  const fields = sources.map((source, i) => {
    if (source.type === "filter") {
      return `r${i}: Page(page: $page, perPage: $perPage) {
    pageInfo { hasNextPage }
    media(${filterArgs(source.filters, i, declarations, variables).join(", ")}) { ...card }
  }`;
    }
    if (source.type === "airing") {
      declarations.push(`$before${i}: Int`);
      variables[`before${i}`] = source.before;
      return `r${i}: Page(page: $page, perPage: $perPage) {
    pageInfo { hasNextPage }
    airingSchedules(airingAt_lesser: $before${i}, sort: TIME_DESC) { episode airingAt media { ...card } }
  }`;
    }

    const args = ["type: ANIME", "isAdult: false", `sort: [${source.sort}]`];
    if (source.season) args.push(`season: ${source.season}`);
    if (source.seasonYear) args.push(`seasonYear: ${Math.trunc(source.seasonYear)}`);
    if (source.status) args.push(`status: ${source.status}`);
    if (source.genre) {
      declarations.push(`$genre${i}: String`);
      variables[`genre${i}`] = source.genre;
      args.push(`genre: $genre${i}`);
    }
    if (source.tag) {
      declarations.push(`$tag${i}: String`);
      variables[`tag${i}`] = source.tag;
      args.push(`tag: $tag${i}`);
    }
    if (source.search) {
      declarations.push(`$search${i}: String`);
      variables[`search${i}`] = source.search;
      args.push(`search: $search${i}`);
    }
    return `r${i}: Page(page: $page, perPage: $perPage) {
    pageInfo { hasNextPage }
    media(${args.join(", ")}) { ...card }
  }`;
  });

  return {
    query: `query (${declarations.join(", ")}) {\n  ${fields.join("\n  ")}\n}\n${CARD_FRAGMENT}`,
    variables,
  };
}

/**
 * Media arguments for the advanced search. Enum values were checked against fixed lists
 * and go inline; names (genres, tags) and the text go through variables.
 */
function filterArgs(f: CatalogFilters, i: number, declarations: string[], variables: Record<string, unknown>) {
  const args = ["type: ANIME", "isAdult: false", `sort: [${effectiveSort(f)}]`];
  const variable = (name: string, type: string, value: unknown, arg: string) => {
    declarations.push(`$${name}${i}: ${type}`);
    variables[`${name}${i}`] = value;
    args.push(`${arg}: $${name}${i}`);
  };

  if (f.q) variable("search", "String", f.q, "search");
  // Several genres or tags must all match (AniList's genre_in / tag_in are AND)
  if (f.genres.length) variable("genres", "[String]", f.genres, "genre_in");
  if (f.excludeGenres.length) variable("noGenres", "[String]", f.excludeGenres, "genre_not_in");
  if (f.tags.length) variable("tags", "[String]", f.tags, "tag_in");
  if (f.excludeTags.length) variable("noTags", "[String]", f.excludeTags, "tag_not_in");
  if (f.formats.length) args.push(`format_in: [${f.formats.join(", ")}]`);
  if (f.statuses.length) args.push(`status_in: [${f.statuses.join(", ")}]`);
  if (f.sources.length) args.push(`source_in: [${f.sources.join(", ")}]`);
  if (f.season) args.push(`season: ${f.season}`);
  if (f.country) args.push(`countryOfOrigin: "${f.country}"`);
  // FuzzyDateInt is YYYYMMDD; the bounds are exclusive
  if (f.yearFrom) args.push(`startDate_greater: ${f.yearFrom * 10000}`);
  if (f.yearTo) args.push(`startDate_lesser: ${(f.yearTo + 1) * 10000}`);
  const { min, max } = lengthRange(f.length);
  if (min) args.push(`episodes_greater: ${min - 1}`);
  if (max) args.push(`episodes_lesser: ${max + 1}`);
  if (f.minScore) args.push(`averageScore_greater: ${f.minScore - 1}`);
  return args;
}

export const DETAIL_QUERY = `
query ($id: Int) {
  Media(id: $id, type: ANIME) {
    ...card
    title { english romaji native }
    description(asHtml: false)
    duration
    startDate { year month day }
    studios(isMain: true) { nodes { name } }
    tags { name isMediaSpoiler isAdult }
    trailer { id site }
    streamingEpisodes { title thumbnail }
    airingSchedule(notYetAired: true, perPage: 50) { nodes { episode airingAt } }
    relations { edges { relationType(version: 2) node { ...card } } }
    recommendations(perPage: 20, sort: [RATING_DESC]) { nodes { mediaRecommendation { ...card } } }
  }
}
${CARD_FRAGMENT}`;

export const SCHEDULE_QUERY = `
query ($page: Int, $from: Int, $to: Int) {
  Page(page: $page, perPage: 50) {
    pageInfo { hasNextPage }
    airingSchedules(airingAt_greater: $from, airingAt_lesser: $to, sort: TIME) {
      episode airingAt media { ...card }
    }
  }
}
${CARD_FRAGMENT}`;

export const GENRES_QUERY = `query { GenreCollection }`;

export const TAGS_QUERY = `query { MediaTagCollection { name description category isAdult } }`;

/**
 * Current cards for AniList IDs, plus the episodes they aired since `since` (newest first), so
 * the library can tell when a show on someone's list has a new episode
 */
export const FRESH_CARDS_QUERY = `
query ($ids: [Int], $since: Int) {
  cards: Page(perPage: 50) {
    media(id_in: $ids, type: ANIME) { ...card }
  }
  aired: Page(perPage: 50) {
    airingSchedules(mediaId_in: $ids, airingAt_greater: $since, notYetAired: false, sort: TIME_DESC) { mediaId episode airingAt }
  }
}
${CARD_FRAGMENT}`;

/** An anime's prequels and sequels, one step of walking a franchise in watch order */
export const SEQUELS_QUERY = `
query ($id: Int) {
  Media(id: $id, type: ANIME) {
    ...card
    startDate { year month day }
    relations { edges { relationType(version: 2) node { id type } } }
  }
}
${CARD_FRAGMENT}`;

export const BY_MAL_IDS_QUERY = `
query ($ids: [Int]) {
  Page(perPage: 50) {
    media(idMal_in: $ids, type: ANIME) { ...card }
  }
}
${CARD_FRAGMENT}`;
