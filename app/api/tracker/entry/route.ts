import { NextRequest } from "next/server";
import { TrackerError } from "@/lib/trackers";
import type { EntryChanges, ListStatus } from "@/lib/trackers/types";
import {
  getTrackerSession,
  isCrossSite,
  notSignedIn,
  parseIds,
  resolveTrackerIds,
  trackerJson,
  type TrackerSession,
} from "@/lib/trackers/session";

export const dynamic = "force-dynamic";

const STATUSES = new Set<ListStatus>(["watching", "planning", "completed", "paused", "dropped"]);

function parseChanges(body: { status?: unknown; score?: unknown }): EntryChanges | null {
  const changes: EntryChanges = {};
  if (body.status !== undefined) {
    if (!STATUSES.has(body.status as ListStatus)) return null;
    changes.status = body.status as ListStatus;
  }
  if (body.score !== undefined) {
    const score = body.score === null ? 0 : Number(body.score);
    if (!Number.isInteger(score) || score < 0 || score > 10) return null;
    changes.score = score || null;
  }
  return changes.status || changes.score !== undefined ? changes : null;
}

function failed(session: TrackerSession, err: unknown) {
  const status = err instanceof TrackerError && err.status === 404 ? 404 : 502;
  return trackerJson(session, { success: false, error: (err as Error).message }, status);
}

/**
 * PATCH /api/tracker/entry { anilistId | malId, status?, score? }: sets the status and/or score
 * (0–10, null or 0 clears it) on the signed-in user's list, adding the anime if needed.
 */
export async function PATCH(request: NextRequest) {
  if (isCrossSite(request)) return trackerJson(null, { success: false, error: "Forbidden" }, 403);

  const body = await request.json().catch(() => ({}));
  const ids = parseIds(body);
  const changes = parseChanges(body);
  if ((!ids.anilistId && !ids.malId) || !changes) {
    return trackerJson(null, { success: false, error: "A MAL or AniList ID and a status or score are required" }, 400);
  }

  const session = await getTrackerSession(request);
  if (!session) return notSignedIn();

  try {
    const resolved = await resolveTrackerIds(session.tracker, ids);
    const entry = await session.tracker.updateEntry(session.accessToken, resolved, changes);
    return trackerJson(session, { success: true, entry: { ...entry, anilistId: entry.anilistId ?? resolved.anilistId } });
  } catch (err) {
    return failed(session, err);
  }
}

/** DELETE /api/tracker/entry { anilistId | malId }: takes the anime off the signed-in user's list */
export async function DELETE(request: NextRequest) {
  if (isCrossSite(request)) return trackerJson(null, { success: false, error: "Forbidden" }, 403);

  const ids = parseIds(await request.json().catch(() => ({})));
  if (!ids.anilistId && !ids.malId) {
    return trackerJson(null, { success: false, error: "A MAL or AniList ID is required" }, 400);
  }

  const session = await getTrackerSession(request);
  if (!session) return notSignedIn();

  try {
    await session.tracker.removeEntry(session.accessToken, await resolveTrackerIds(session.tracker, ids));
    return trackerJson(session, { success: true });
  } catch (err) {
    return failed(session, err);
  }
}
