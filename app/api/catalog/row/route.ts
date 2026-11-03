import { NextRequest } from "next/server";
import { getGenres, getRow, MAX_ROW_PAGE } from "@/lib/anilist/catalog";
import { ROW_KINDS, type RowKind } from "@/lib/anilist/types";
import { catalogError, catalogJson, upstreamError } from "../shared";

export const dynamic = "force-dynamic";

/** GET /api/catalog/row?kind=genre&value=Action&page=2 */
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
  if ((kind === "genre" || kind === "tag") && !value) {
    return catalogError(400, "MISSING_VALUE", `kind=${kind} needs a value`);
  }
  if (kind === "tag" && value!.length > 60) {
    return catalogError(400, "INVALID_VALUE", "tag is too long");
  }

  try {
    // Only known genres, so a typo can't fill the cache with empty rows
    if (kind === "genre" && !(await getGenres()).some((g) => g.name === value)) {
      return catalogError(400, "INVALID_VALUE", `Unknown genre: ${value}`);
    }
    const isFiltered = kind === "genre" || kind === "tag";
    return catalogJson({ row: await getRow(kind, isFiltered ? value : undefined, page) }, 300);
  } catch (err) {
    return upstreamError(err);
  }
}
