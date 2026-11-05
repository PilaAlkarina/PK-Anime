import { NextRequest } from "next/server";
import { getThemes } from "@/lib/animethemes";
import { catalogError, catalogJson } from "../shared";

export const dynamic = "force-dynamic";

const MAX_IDS = 200;

/**
 * GET /api/catalog/themes?ids=1535,9253: openings and endings from AnimeThemes for AniList IDs,
 * as { themes: { [anilistId]: AnimeTheme[] } }
 */
export async function GET(request: NextRequest) {
  const ids = (request.nextUrl.searchParams.get("ids") || "")
    .split(",")
    .map(Number)
    .filter((id) => Number.isInteger(id) && id > 0);
  if (ids.length === 0) return catalogError(400, "INVALID_IDS", "ids must be a comma-separated list of AniList IDs");
  if (ids.length > MAX_IDS) return catalogError(400, "TOO_MANY_IDS", `At most ${MAX_IDS} IDs`);
  try {
    const found = await getThemes(ids);
    return catalogJson({ themes: Object.fromEntries(found) }, 3600);
  } catch (err) {
    console.warn("[themes] AnimeThemes request failed:", err instanceof Error ? err.message : err);
    return catalogError(502, "ANIMETHEMES_UNAVAILABLE", "AnimeThemes is not responding, try again shortly");
  }
}
