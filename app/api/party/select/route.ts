import { NextRequest } from "next/server";
import { findParty, selectEpisode } from "@/lib/watch-party/store";
import { isCrossSite, pairJson } from "@/lib/pairing/http";

export const dynamic = "force-dynamic";

/** POST /api/party/select { code, member, animeId, episode, audio }: the host picks an episode */
export async function POST(request: NextRequest) {
  if (isCrossSite(request)) return pairJson({ success: false, error: "Forbidden" }, 403);
  const body = await request.json().catch(() => ({}));
  const party = findParty(body.code);
  if (!party) return pairJson({ success: false, code: "UNKNOWN_ROOM", error: "No room with that code" }, 404);
  const animeId = Number(body.animeId);
  const episode = Number(body.episode);
  if (!Number.isInteger(animeId) || animeId < 1 || !Number.isInteger(episode) || episode < 1) {
    return pairJson({ success: false, error: "animeId and episode must be positive integers" }, 400);
  }
  const result = selectEpisode(party, String(body.member), { animeId, episode, audio: body.audio === "dub" ? "dub" : "sub" });
  if (result !== "OK") return pairJson({ success: false, code: result, error: "Only the host picks what to watch" }, 403);
  return pairJson({ success: true });
}
