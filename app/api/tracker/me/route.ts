import { NextRequest } from "next/server";
import { configuredTrackers } from "@/lib/trackers";
import { getTrackerSession, trackerJson } from "@/lib/trackers/session";

export const dynamic = "force-dynamic";

/** GET /api/tracker/me: the signed-in list account, and the providers available to sign in with */
export async function GET(request: NextRequest) {
  const session = await getTrackerSession(request);
  return trackerJson(session, {
    success: true,
    signedIn: !!session,
    provider: session ? { id: session.tracker.id, name: session.tracker.name } : null,
    user: session?.user ?? null,
    providers: configuredTrackers(),
  });
}
