import { NextRequest } from "next/server";
import { getWatchOrder } from "@/lib/anilist/catalog";
import { catalogError, catalogJson, upstreamError } from "../../shared";

export const dynamic = "force-dynamic";

/** GET /api/catalog/franchise/{anilistId}: the franchise in watch order (empty for a standalone anime) */
export async function GET(_request: NextRequest, { params }: { params: { id: string } }) {
  const id = Number(params.id);
  if (!Number.isInteger(id) || id < 1) {
    return catalogError(400, "INVALID_ID", "id must be a positive AniList ID");
  }
  try {
    return catalogJson({ items: await getWatchOrder(id) }, 3600);
  } catch (err) {
    return upstreamError(err);
  }
}
