import { NextRequest } from "next/server";
import { findParty, requestPlayback, type PlaybackRequest } from "@/lib/watch-party/store";
import { isCrossSite, pairJson } from "@/lib/pairing/http";

export const dynamic = "force-dynamic";

const finite = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n) && n >= 0;

/**
 * POST /api/party/playback { code, member, action, position? }: a pause or a resume (anyone), a
 * jump (host only), or a player that ran out of buffer. Each opens a barrier for everyone.
 */
export async function POST(request: NextRequest) {
  if (isCrossSite(request)) return pairJson({ success: false, error: "Forbidden" }, 403);
  const body = await request.json().catch(() => ({}));
  const party = findParty(body.code);
  if (!party) return pairJson({ success: false, code: "UNKNOWN_ROOM", error: "No room with that code" }, 404);
  let req: PlaybackRequest | null = null;
  if (body.action === "play") req = { action: "play" };
  else if ((body.action === "pause" || body.action === "seek" || body.action === "stall") && finite(body.position)) {
    req = { action: body.action, position: body.position };
  }
  if (!req) return pairJson({ success: false, error: "Unknown action" }, 400);
  const result = requestPlayback(party, String(body.member), req);
  if (result === "NOT_A_MEMBER") return pairJson({ success: false, code: result, error: "Not in this room" }, 403);
  if (result === "NOT_HOST") return pairJson({ success: false, code: result, error: "Only the host can jump" }, 403);
  return pairJson({ success: true });
}
