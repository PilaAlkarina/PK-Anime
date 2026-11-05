import { NextRequest } from "next/server";
import { cleanName, findParty, joinParty } from "@/lib/watch-party/store";
import { isCrossSite, pairJson } from "@/lib/pairing/http";

export const dynamic = "force-dynamic";

/** POST /api/party/join { code, name }: joins a room; answers with where it is */
export async function POST(request: NextRequest) {
  if (isCrossSite(request)) return pairJson({ success: false, error: "Forbidden" }, 403);
  const body = await request.json().catch(() => ({}));
  const party = findParty(body.code);
  if (!party) return pairJson({ success: false, code: "UNKNOWN_ROOM", error: "No room with that code" }, 404);
  const member = joinParty(party, cleanName(body.name));
  if (!member) return pairJson({ success: false, code: "ROOM_FULL", error: "The room is full" }, 409);
  return pairJson({ success: true, code: party.code, member, state: party.state, serverNow: Date.now() });
}
