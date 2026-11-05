import { NextRequest } from "next/server";
import { findParty, markReady } from "@/lib/watch-party/store";
import { isCrossSite, pairJson } from "@/lib/pairing/http";

export const dynamic = "force-dynamic";

/** POST /api/party/ready { code, member, animeId, episode }: this device has the episode loaded */
export async function POST(request: NextRequest) {
  if (isCrossSite(request)) return pairJson({ success: false, error: "Forbidden" }, 403);
  const body = await request.json().catch(() => ({}));
  const party = findParty(body.code);
  if (!party) return pairJson({ success: false, code: "UNKNOWN_ROOM", error: "No room with that code" }, 404);
  const ok = markReady(party, String(body.member), { animeId: Number(body.animeId), episode: Number(body.episode) });
  if (!ok) return pairJson({ success: false, code: "NOT_A_MEMBER", error: "Not in this room" }, 403);
  return pairJson({ success: true });
}
