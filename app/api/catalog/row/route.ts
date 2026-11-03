import { NextRequest } from "next/server";
import { getGenres, getRow, getTags, MAX_ROW_PAGE } from "@/lib/anilist/catalog";
import { filtersKey, parseFilters } from "@/lib/anilist/filters";
import { ROW_KINDS, type RowKind } from "@/lib/anilist/types";
import { catalogError, catalogJson, upstreamError } from "../shared";

export const dynamic = "force-dynamic";

/**
 * GET /api/catalog/row?kind=genre&value=Action&page=2 (also kind=tag and kind=search).
 * kind=filter takes the advanced search's query string as value (see lib/anilist/filters).
 */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const kind = searchParams.get("kind") as RowKind | null;
  const value = searchParams.get("value")?.trim() || undefined;
  const page = parseInt(searchParams.get("page") || "1", 10);

  if (!kind || !ROW_KINDS.includes(kind)) {
    return catalogError(400, "INVALID_KIND", `kind must be one of: ${ROW_KINDS.join(", ")}`);
  }
  if (!Number.isInteger(page) || page < 1 || page > MAX_ROW_PAGE) {
    return catalogError(400, "INVALID_PAGE", `page must be between 1 and ${MAX_ROW_PAGE}`);
  }
  const isFiltered = kind === "genre" || kind === "tag" || kind === "search";
  if (isFiltered && !value) {
    return catalogError(400, "MISSING_VALUE", `kind=${kind} needs a value`);
  }
  if ((kind === "tag" || kind === "search") && value!.length > 60) {
    return catalogError(400, "INVALID_VALUE", `${kind} is too long`);
  }

  if (kind === "filter") {
    if (value && value.length > 2000) return catalogError(400, "INVALID_VALUE", "filter is too long");
    try {
      // Unknown genres and tags are dropped and the rest put in a fixed order, so equal
      // searches share one cache entry and a typo can't fill the cache with empty rows
      const [genres, tags] = await Promise.all([getGenres(), getTags()]);
      const known = (list: string[], all: { name: string }[]) => list.filter((n) => all.some((x) => x.name === n));
      const filters = parseFilters(new URLSearchParams(value || ""));
      const canonical = filtersKey({
        ...filters,
        genres: known(filters.genres, genres),
        excludeGenres: known(filters.excludeGenres, genres),
        tags: known(filters.tags, tags),
        excludeTags: known(filters.excludeTags, tags),
      });
      return catalogJson({ row: await getRow("filter", canonical || undefined, page) }, 300);
    } catch (err) {
      return upstreamError(err);
    }
  }

  try {
    // Only known genres, so a typo can't fill the cache with empty rows
    if (kind === "genre" && !(await getGenres()).some((g) => g.name === value)) {
      return catalogError(400, "INVALID_VALUE", `Unknown genre: ${value}`);
    }
    return catalogJson({ row: await getRow(kind, isFiltered ? value : undefined, page) }, 300);
  } catch (err) {
    return upstreamError(err);
  }
}
