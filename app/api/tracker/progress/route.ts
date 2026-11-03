import { NextRequest } from "next/server";
import { TrackerError } from "@/lib/trackers";
import {
  getTrackerSession,
  isCrossSite,
  notSignedIn,
  parseIds,
  resolveTrackerIds,
  trackerJson,
} from "@/lib/trackers/session";

export const dynamic = "force-dynamic";

/**
 * POST /api/tracker/progress { anilistId | malId, episode }: marks an episode as watched on the
 * signed-in user's list. Never lowers the progress already there.
 */
export async function POST(request: NextRequest) {
  if (isCrossSite(request)) return trackerJson(null, { success: false, error: "Forbidden" }, 403);

  const body = await request.json().catch(() => ({}));
  const episode = Number(body.episode);
  const ids = parseIds(body);
  if ((!ids.anilistId && !ids.malId) || !Number.isInteger(episode) || episode < 1) {
    return trackerJson(null, { success: false, error: "A MAL or AniList ID and an episode are required" }, 400);
  }

  const session = await getTrackerSession(request);
  if (!session) return notSignedIn();

  try {
    const resolved = await resolveTrackerIds(session.tracker, ids);
    const { updated, entry } = await session.tracker.saveProgress(session.accessToken, resolved, episode);
    return trackerJson(session, {
      success: true,
      updated,
      provider: { id: session.tracker.id, name: session.tracker.name },
      entry,
    });
  } catch (err) {
    const status = err instanceof TrackerError && err.status === 404 ? 404 : 502;
    return trackerJson(session, { success: false, error: (err as Error).message }, status);
  }
}
