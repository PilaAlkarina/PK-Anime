import { NextRequest } from "next/server";
import { cleanName, createParty } from "@/lib/watch-party/store";
import { isCrossSite, pairJson } from "@/lib/pairing/http";

export const dynamic = "force-dynamic";

/** POST /api/party { animeId, episode, audio, name }: opens a "Ver juntos" room for that episode */
export async function POST(request: NextRequest) {
  if (isCrossSite(request)) return pairJson({ success: false, error: "Forbidden" }, 403);
  const body = await request.json().catch(() => ({}));
  const animeId = Number(body.animeId);
  const episode = Number(body.episode);
  if (!Number.isInteger(animeId) || animeId < 1 || !Number.isInteger(episode) || episode < 1) {
    return pairJson({ success: false, error: "animeId and episode must be positive integers" }, 400);
  }
  const created = createParty({ animeId, episode, audio: body.audio === "dub" ? "dub" : "sub" }, cleanName(body.name));
  if (!created) return pairJson({ success: false, error: "Too many rooms open, try again later" }, 503);
  return pairJson({ success: true, code: created.party.code, member: created.member, state: created.party.state });
}
