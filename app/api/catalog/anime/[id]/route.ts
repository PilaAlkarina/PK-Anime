import { NextRequest } from "next/server";
import { getAnime } from "@/lib/anilist/catalog";
import { catalogError, catalogJson, upstreamError } from "../../shared";

export const dynamic = "force-dynamic";

/** GET /api/catalog/anime/{anilistId} */
export async function GET(_request: NextRequest, { params }: { params: { id: string } }) {
  const id = Number(params.id);
  if (!Number.isInteger(id) || id < 1) {
    return catalogError(400, "INVALID_ID", "id must be a positive AniList ID");
  }

  try {
    const anime = await getAnime(id);
    if (!anime) return catalogError(404, "NOT_FOUND", `No anime with AniList ID ${id}`);
    return catalogJson({ anime }, 3600);
  } catch (err) {
    return upstreamError(err);
  }
}
