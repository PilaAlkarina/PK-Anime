import { NextRequest } from "next/server";
import { getFreshCards } from "@/lib/anilist/catalog";
import { catalogError, catalogJson, upstreamError } from "../shared";

export const dynamic = "force-dynamic";

const MAX_IDS = 200;

/**
 * GET /api/catalog/cards?ids=1,2,3: current cards for AniList IDs, with `airedEpisode` on shows
 * that aired an episode in the last three weeks. IDs AniList doesn't list are left out.
 */
export async function GET(request: NextRequest) {
  const raw = request.nextUrl.searchParams.get("ids") || "";
  const ids = raw
    .split(",")
    .map(Number)
    .filter((id) => Number.isInteger(id) && id > 0);
  if (ids.length === 0) return catalogError(400, "INVALID_IDS", "ids must be a comma-separated list of AniList IDs");
  if (ids.length > MAX_IDS) return catalogError(400, "TOO_MANY_IDS", `At most ${MAX_IDS} IDs`);

  try {
    return catalogJson({ cards: await getFreshCards(ids) }, 300);
  } catch (err) {
    return upstreamError(err);
  }
}
