import type { MediaSeason, MediaStatus } from "./types";

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
  | { type: "airing"; before: number };

const CARD_FRAGMENT = `
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
