/**
 * Advanced search filters. Shared by the server (query building, validation) and the
 * screens (URL state, labels), so it must stay free of server imports.
 *
 * The URL is the single source of truth: /search?q=…&genre=Action&genre=Drama&format=TV…
 * The same string, canonicalised, is the `value` of a `filter` catalog row, which makes it
 * the cache key too.
 */

import type { MediaSeason, MediaStatus } from "./types";

export const FORMAT_OPTIONS = [
  { value: "TV", label: "Serie" },
  { value: "TV_SHORT", label: "Serie corta" },
  { value: "MOVIE", label: "Película" },
  { value: "SPECIAL", label: "Especial" },
  { value: "OVA", label: "OVA" },
  { value: "ONA", label: "ONA" },
  { value: "MUSIC", label: "Musical" },
] as const;

export const STATUS_OPTIONS: { value: MediaStatus; label: string }[] = [
  { value: "RELEASING", label: "En emisión" },
  { value: "FINISHED", label: "Finalizado" },
  { value: "NOT_YET_RELEASED", label: "Próximamente" },
  { value: "HIATUS", label: "En pausa" },
  { value: "CANCELLED", label: "Cancelado" },
];

export const SEASON_OPTIONS: { value: MediaSeason; label: string }[] = [
  { value: "WINTER", label: "Invierno" },
  { value: "SPRING", label: "Primavera" },
  { value: "SUMMER", label: "Verano" },
  { value: "FALL", label: "Otoño" },
];

export const SOURCE_OPTIONS = [
  { value: "ORIGINAL", label: "Original" },
  { value: "MANGA", label: "Manga" },
  { value: "LIGHT_NOVEL", label: "Novela ligera" },
  { value: "WEB_NOVEL", label: "Novela web" },
  { value: "NOVEL", label: "Novela" },
  { value: "VISUAL_NOVEL", label: "Novela visual" },
  { value: "VIDEO_GAME", label: "Videojuego" },
  { value: "GAME", label: "Juego" },
  { value: "MULTIMEDIA_PROJECT", label: "Proyecto multimedia" },
  { value: "OTHER", label: "Otro" },
] as const;

export const COUNTRY_OPTIONS = [
  { value: "JP", label: "Japón" },
  { value: "CN", label: "China" },
  { value: "KR", label: "Corea del Sur" },
  { value: "TW", label: "Taiwán" },
] as const;

/** Episode-count buckets, easier to pick with a remote than two number fields */
export const LENGTH_OPTIONS = [
  { value: "short", label: "Hasta 13 episodios", min: undefined, max: 13 },
  { value: "medium", label: "De 14 a 26", min: 14, max: 26 },
  { value: "long", label: "Más de 26", min: 27, max: undefined },
] as const;

export const SCORE_OPTIONS = [60, 70, 75, 80, 85] as const;

export const SORT_OPTIONS = [
  { value: "POPULARITY_DESC", label: "Más populares" },
  { value: "TRENDING_DESC", label: "Tendencia" },
  { value: "SCORE_DESC", label: "Mejor valorados" },
  { value: "START_DATE_DESC", label: "Más recientes" },
  { value: "START_DATE", label: "Más antiguos" },
  { value: "FAVOURITES_DESC", label: "Más favoritos" },
  { value: "TITLE_ROMAJI", label: "Título (A–Z)" },
] as const;

export type FormatValue = (typeof FORMAT_OPTIONS)[number]["value"];
export type SourceValue = (typeof SOURCE_OPTIONS)[number]["value"];
export type CountryValue = (typeof COUNTRY_OPTIONS)[number]["value"];
export type LengthValue = (typeof LENGTH_OPTIONS)[number]["value"];
export type SortValue = (typeof SORT_OPTIONS)[number]["value"];

export const MIN_YEAR = 1940;
export const MAX_QUERY_LENGTH = 60;
const MAX_LIST = 10;

export interface CatalogFilters {
  q: string;
  genres: string[];
  excludeGenres: string[];
  tags: string[];
  excludeTags: string[];
  formats: FormatValue[];
  statuses: MediaStatus[];
  season: MediaSeason | null;
  yearFrom: number | null;
  yearTo: number | null;
  sources: SourceValue[];
  country: CountryValue | null;
  length: LengthValue | null;
  minScore: number | null;
  /** null: by relevance when there is text, by popularity otherwise */
  sort: SortValue | null;
}

export const EMPTY_FILTERS: CatalogFilters = {
  q: "",
  genres: [],
  excludeGenres: [],
  tags: [],
  excludeTags: [],
  formats: [],
  statuses: [],
  season: null,
  yearFrom: null,
  yearTo: null,
  sources: [],
  country: null,
  length: null,
  minScore: null,
  sort: null,
};

// URL keys, in the order the canonical string uses
const KEYS = {
  q: "q",
  genres: "genre",
  excludeGenres: "no-genre",
  tags: "tag",
  excludeTags: "no-tag",
  formats: "format",
  statuses: "status",
  season: "season",
  yearFrom: "from",
  yearTo: "to",
  sources: "source",
  country: "country",
  length: "length",
  minScore: "score",
  sort: "sort",
} as const;

function pick<T extends string>(values: string[], allowed: readonly { value: T }[]): T[] {
  const ok = new Set(allowed.map((o) => o.value as string));
  return Array.from(new Set(values.filter((v) => ok.has(v)))).slice(0, MAX_LIST) as T[];
}

function names(values: string[]) {
  return Array.from(new Set(values.map((v) => v.trim()).filter((v) => v && v.length <= 60))).slice(0, MAX_LIST);
}

function year(value: string | null) {
  const n = Number(value);
  return Number.isInteger(n) && n >= MIN_YEAR && n <= new Date().getFullYear() + 2 ? n : null;
}

/** Reads filters from a query string; anything unknown or out of range is dropped */
export function parseFilters(params: URLSearchParams): CatalogFilters {
  const one = <T extends string>(key: string, allowed: readonly { value: T }[]) =>
    pick(params.getAll(key).slice(0, 1), allowed)[0] ?? null;
  const score = Number(params.get(KEYS.minScore));
  let yearFrom = year(params.get(KEYS.yearFrom));
  let yearTo = year(params.get(KEYS.yearTo));
  if (yearFrom && yearTo && yearFrom > yearTo) [yearFrom, yearTo] = [yearTo, yearFrom];

  const genres = names(params.getAll(KEYS.genres));
  const tags = names(params.getAll(KEYS.tags));
  return {
    q: (params.get(KEYS.q) || "").trim().slice(0, MAX_QUERY_LENGTH),
    genres,
    excludeGenres: names(params.getAll(KEYS.excludeGenres)).filter((g) => !genres.includes(g)),
    tags,
    excludeTags: names(params.getAll(KEYS.excludeTags)).filter((t) => !tags.includes(t)),
    formats: pick(params.getAll(KEYS.formats), FORMAT_OPTIONS),
    statuses: pick(params.getAll(KEYS.statuses), STATUS_OPTIONS),
    season: one(KEYS.season, SEASON_OPTIONS),
    yearFrom,
    yearTo,
    sources: pick(params.getAll(KEYS.sources), SOURCE_OPTIONS),
    country: one(KEYS.country, COUNTRY_OPTIONS),
    length: one(KEYS.length, LENGTH_OPTIONS),
    minScore: (SCORE_OPTIONS as readonly number[]).includes(score) ? score : null,
    sort: one(KEYS.sort, SORT_OPTIONS),
  };
}

/** Query string for the filters; lists are sorted so equal filters give equal strings */
export function filtersToParams(filters: CatalogFilters): URLSearchParams {
  const params = new URLSearchParams();
  for (const [field, key] of Object.entries(KEYS) as [keyof CatalogFilters, string][]) {
    const value = filters[field];
    if (Array.isArray(value)) [...value].sort().forEach((v) => params.append(key, String(v)));
    else if (value !== null && value !== "") params.set(key, String(value));
  }
  return params;
}

export const filtersKey = (filters: CatalogFilters) => filtersToParams(filters).toString();

/** Filters other than the text, i.e. what the "Filtros" button counts */
export function countFilters(f: CatalogFilters) {
  return (
    f.genres.length +
    f.excludeGenres.length +
    f.tags.length +
    f.excludeTags.length +
    f.formats.length +
    f.statuses.length +
    f.sources.length +
    [f.season, f.yearFrom ?? f.yearTo, f.country, f.length, f.minScore].filter((v) => v !== null).length
  );
}

export const hasAnyFilter = (f: CatalogFilters) => !!f.q || countFilters(f) > 0 || f.sort !== null;

export function effectiveSort(f: CatalogFilters): SortValue | "SEARCH_MATCH" {
  return f.sort ?? (f.q ? "SEARCH_MATCH" : "POPULARITY_DESC");
}

export function lengthRange(length: LengthValue | null) {
  const option = LENGTH_OPTIONS.find((o) => o.value === length);
  return { min: option?.min, max: option?.max };
}

/** Adds the value to the list or takes it out */
export function toggle<T>(list: T[], value: T): T[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
}

/**
 * Include → exclude → off, for genres and tags. Returns both lists so one value is never
 * included and excluded at the same time.
 */
export function cycleInclusion(include: string[], exclude: string[], value: string) {
  if (include.includes(value)) return { include: include.filter((v) => v !== value), exclude: [...exclude, value] };
  if (exclude.includes(value)) return { include, exclude: exclude.filter((v) => v !== value) };
  return { include: [...include, value], exclude };
}

const optionLabel = <T extends string>(options: readonly { value: T; label: string }[], value: T) =>
  options.find((o) => o.value === value)?.label ?? value;

/** Short labels for everything applied except the text, e.g. ["Serie", "Acción", "Sin Drama"] */
export function filterLabels(f: CatalogFilters, genreLabel: (name: string) => string = (n) => n): string[] {
  const years = yearLabel(f);
  return [
    ...f.formats.map((v) => optionLabel(FORMAT_OPTIONS, v)),
    ...f.statuses.map((v) => optionLabel(STATUS_OPTIONS, v)),
    ...(f.season ? [optionLabel(SEASON_OPTIONS, f.season)] : []),
    ...(years ? [years] : []),
    ...f.genres.map(genreLabel),
    ...f.excludeGenres.map((g) => `Sin ${genreLabel(g)}`),
    ...f.tags,
    ...f.excludeTags.map((t) => `Sin ${t}`),
    ...f.sources.map((v) => optionLabel(SOURCE_OPTIONS, v)),
    ...(f.length ? [optionLabel(LENGTH_OPTIONS, f.length)] : []),
    ...(f.minScore ? [`${f.minScore} %+`] : []),
    ...(f.country ? [optionLabel(COUNTRY_OPTIONS, f.country)] : []),
  ];
}

export function yearLabel(f: Pick<CatalogFilters, "yearFrom" | "yearTo">) {
  if (f.yearFrom && f.yearTo) return f.yearFrom === f.yearTo ? `${f.yearFrom}` : `${f.yearFrom}–${f.yearTo}`;
  if (f.yearFrom) return `Desde ${f.yearFrom}`;
  if (f.yearTo) return `Hasta ${f.yearTo}`;
  return null;
}
