import { NextRequest } from "next/server";
import { findParty, setPlayback } from "@/lib/watch-party/store";
import { isCrossSite, pairJson } from "@/lib/pairing/http";

export const dynamic = "force-dynamic";

/** POST /api/party/state { code, member, playing?, position? }: a pause, play or jump while watching */
export async function POST(request: NextRequest) {
  if (isCrossSite(request)) return pairJson({ success: false, error: "Forbidden" }, 403);
  const body = await request.json().catch(() => ({}));
  const party = findParty(body.code);
  if (!party) return pairJson({ success: false, code: "UNKNOWN_ROOM", error: "No room with that code" }, 404);
  const changes: { playing?: boolean; position?: number } = {};
  if (typeof body.playing === "boolean") changes.playing = body.playing;
  if (typeof body.position === "number" && Number.isFinite(body.position) && body.position >= 0) changes.position = body.position;
  if (!setPlayback(party, String(body.member), changes)) {
    return pairJson({ success: false, code: "NOT_A_MEMBER", error: "Not in this room" }, 403);
  }
  return pairJson({ success: true });
}
