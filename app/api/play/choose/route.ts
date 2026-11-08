import { NextRequest, NextResponse } from "next/server";
import { chooseServer } from "@/lib/server-choice";
import { STREAM_SERVERS, type StreamServer } from "@/lib/server-settings";

export const dynamic = "force-dynamic";
// Asking every server takes a few seconds at most; the late ones carry on in the background
export const maxDuration = 30;

/**
 * GET /api/play/choose?anilistId=&malId=&episode=&audio=sub|dub&langs=es,en&subs=1&dubSubs=full&server=auto
 *
 * The stream server to play an episode from, chosen on the server (see lib/server-choice.ts),
 * with the reason, the other servers ranked as fallbacks and the chosen server's /api/play data,
 * so the player can start right away. `prefetch=1` only warms the cache (the next episode).
 */
export async function GET(request: NextRequest) {
  const p = request.nextUrl.searchParams;
  const anilistId = Number(p.get("anilistId")) || null;
  const malId = Number(p.get("malId")) || null;
  const episode = Number(p.get("episode"));
  if ((!anilistId && !malId) || !Number.isInteger(episode) || episode < 0) {
    return NextResponse.json({ success: false, error: "Faltan anilistId/malId o episode" }, { status: 400 });
  }
  const languages = (p.get("langs") || "")
    .split(",")
    .map((code) => code.trim().toLowerCase())
    .filter((code) => /^[a-z]{2}$/.test(code))
    .slice(0, 6);
  const dubSubs = p.get("dubSubs");
  const server = (p.get("server") || "auto").toLowerCase();

  const result = await chooseServer(
    {
      anilistId,
      malId,
      episode,
      audio: p.get("audio") === "dub" ? "dub" : "sub",
      languages,
      subtitlesEnabled: p.get("subs") !== "0",
      dubSubtitles: dubSubs === "forced" || dubSubs === "off" ? dubSubs : "full",
      preferred: STREAM_SERVERS.includes(server as StreamServer) ? (server as StreamServer) : "auto",
    },
    request
  );

  if (p.get("prefetch") === "1") {
    return NextResponse.json({ success: result.success, server: result.server }, { headers: { "Cache-Control": "no-store" } });
  }
  return NextResponse.json(result, { status: result.success ? 200 : 404, headers: { "Cache-Control": "no-store" } });
}
