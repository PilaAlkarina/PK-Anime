import { NextRequest } from "next/server";
import { getSchedule } from "@/lib/anilist/catalog";
import { catalogError, catalogJson, upstreamError } from "../shared";

export const dynamic = "force-dynamic";

const DAY = 24 * 60 * 60;
const MAX_RANGE = 8 * DAY;
// Bounds snap outward to 15 minutes, so clients in any time zone (including :30 and :45
// offsets) reuse the same cache entry for their week; callers filter the edges themselves
const SNAP = 15 * 60;

/** GET /api/catalog/schedule?from={unix seconds}&to={unix seconds}, defaulting to the next 7 days */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const now = Math.floor(Date.now() / 1000);
  const fromRaw = searchParams.get("from");
  const toRaw = searchParams.get("to");
  const from = fromRaw ? Number(fromRaw) : now;
  const to = toRaw ? Number(toRaw) : from + 7 * DAY;

  if (!Number.isInteger(from) || !Number.isInteger(to) || from < 0 || to <= from) {
    return catalogError(400, "INVALID_RANGE", "from and to must be Unix timestamps in seconds, with from < to");
  }
  if (to - from > MAX_RANGE) {
    return catalogError(400, "RANGE_TOO_LONG", "The range can span at most 8 days");
  }

  try {
    const entries = await getSchedule(Math.floor(from / SNAP) * SNAP, Math.ceil(to / SNAP) * SNAP);
    return catalogJson({ entries }, 600);
  } catch (err) {
    return upstreamError(err);
  }
}
