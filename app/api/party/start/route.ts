import { NextRequest } from "next/server";
import { findParty, startNow } from "@/lib/watch-party/store";
import { isCrossSite, pairJson } from "@/lib/pairing/http";

export const dynamic = "force-dynamic";

/** POST /api/party/start { code, member }: the host starts without waiting for everyone */
export async function POST(request: NextRequest) {
  if (isCrossSite(request)) return pairJson({ success: false, error: "Forbidden" }, 403);
  const body = await request.json().catch(() => ({}));
  const party = findParty(body.code);
  if (!party) return pairJson({ success: false, code: "UNKNOWN_ROOM", error: "No room with that code" }, 404);
  if (startNow(party, String(body.member)) !== "OK") return pairJson({ success: false, error: "Only the host can start" }, 403);
  return pairJson({ success: true });
}
