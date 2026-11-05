import { NextRequest } from "next/server";
import { answerBarrier, findParty } from "@/lib/watch-party/store";
import { isCrossSite, pairJson } from "@/lib/pairing/http";

export const dynamic = "force-dynamic";

/**
 * POST /api/party/answer { code, member, barrierId?, position?, ready?, away? }: this device's
 * answer to the open barrier (where it stopped, or that it has the target buffered), and whether
 * it's on the episode or elsewhere. Answers with the server time, for the clock estimate.
 */
export async function POST(request: NextRequest) {
  if (isCrossSite(request)) return pairJson({ success: false, error: "Forbidden" }, 403);
  const body = await request.json().catch(() => ({}));
  const party = findParty(body.code);
  if (!party) return pairJson({ success: false, code: "UNKNOWN_ROOM", error: "No room with that code" }, 404);
  const ok = answerBarrier(party, String(body.member), {
    barrierId: Number.isInteger(body.barrierId) ? body.barrierId : undefined,
    position: typeof body.position === "number" && Number.isFinite(body.position) ? body.position : undefined,
    ready: body.ready === true,
    away: typeof body.away === "boolean" ? body.away : undefined,
  });
  if (!ok) return pairJson({ success: false, code: "NOT_A_MEMBER", error: "Not in this room" }, 403);
  return pairJson({ success: true, serverNow: Date.now() });
}
