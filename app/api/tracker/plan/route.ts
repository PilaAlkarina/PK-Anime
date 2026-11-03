import { NextRequest } from "next/server";
import {
  getTrackerSession,
  isCrossSite,
  notSignedIn,
  parseIds,
  resolveTrackerIds,
  trackerJson,
} from "@/lib/trackers/session";

export const dynamic = "force-dynamic";

const MAX_ITEMS = 25;

/**
 * POST /api/tracker/plan { items: [{ anilistId, malId }] }: adds each anime to the remote list
 * as planned, leaving the ones already on it (in any status) untouched. Items are processed one
 * after another, since MyAnimeList throttles bursts.
 */
export async function POST(request: NextRequest) {
  if (isCrossSite(request)) return trackerJson(null, { success: false, error: "Forbidden" }, 403);

  const body = await request.json().catch(() => ({}));
  const items = Array.isArray(body.items) ? body.items.slice(0, MAX_ITEMS).map(parseIds) : [];
  if (items.length === 0) return trackerJson(null, { success: false, error: "items is required" }, 400);

  const session = await getTrackerSession(request);
  if (!session) return notSignedIn();

  const results = [];
  for (const ids of items) {
    try {
      const resolved = await resolveTrackerIds(session.tracker, ids);
      const { added, entry } = await session.tracker.addToPlanning(session.accessToken, resolved);
      results.push({ ...ids, added, entry });
    } catch (err) {
      results.push({ ...ids, added: false, entry: null, error: (err as Error).message });
    }
  }
  return trackerJson(session, { success: true, provider: { id: session.tracker.id, name: session.tracker.name }, results });
}
