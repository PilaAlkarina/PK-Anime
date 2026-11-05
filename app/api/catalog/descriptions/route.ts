import { NextRequest } from "next/server";
import { getDescriptions } from "@/lib/anilist/catalog";
import { catalogError, catalogJson, upstreamError } from "../shared";

export const dynamic = "force-dynamic";

const MAX_IDS = 50;

/**
 * GET /api/catalog/descriptions?ids=1,2,3: the synopsis of each AniList ID ("" when it has none),
 * for the home hero, which shows a whole row's titles one after another.
 */
export async function GET(request: NextRequest) {
  const ids = (request.nextUrl.searchParams.get("ids") || "")
    .split(",")
    .map(Number)
    .filter((id) => Number.isInteger(id) && id > 0);
  if (ids.length === 0) return catalogError(400, "INVALID_IDS", "ids must be a comma-separated list of AniList IDs");
  if (ids.length > MAX_IDS) return catalogError(400, "TOO_MANY_IDS", `At most ${MAX_IDS} IDs`);

  try {
    return catalogJson({ descriptions: await getDescriptions(ids) }, 3600);
  } catch (err) {
    return upstreamError(err);
  }
}
