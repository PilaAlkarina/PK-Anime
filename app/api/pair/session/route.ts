import { NextRequest } from "next/server";
import { getTrackerSession } from "@/lib/trackers/session";
import { findByController, offerSession } from "@/lib/pairing/store";
import { isCrossSite, pairJson, readSessionCookies } from "@/lib/pairing/http";

export const dynamic = "force-dynamic";

/** POST /api/pair/session { token }: hands the phone's sign-in to its linked TV */
export async function POST(request: NextRequest) {
  if (isCrossSite(request)) return pairJson({ success: false, error: "Forbidden" }, 403);
  const body = await request.json().catch(() => ({}));
  const link = findByController(body.token);
  if (!link) return pairJson({ success: false, code: "NOT_LINKED", error: "This phone is not linked" }, 404);

  const session = await getTrackerSession(request);
  const cookies = readSessionCookies(request);
  if (!session || cookies.length === 0) {
    return pairJson({ success: false, code: "NOT_SIGNED_IN", error: "Sign in on this phone first" }, 401);
  }
  offerSession(link, cookies, session.user.name);
  return pairJson({ success: true, delivered: link.listeners.size > 0 });
}
