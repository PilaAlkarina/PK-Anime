import { NextRequest, NextResponse } from "next/server";
import { isPanelRequest } from "@/lib/internal-auth";
import { statsSnapshot } from "@/lib/server-stats";
import { listParties } from "@/lib/watch-party/store";
import { getAnime } from "@/lib/anilist/catalog";

export const dynamic = "force-dynamic";

const titles = new Map<number, string | null>();

/** The anime's title, looked up once per server start (rooms only know the AniList ID) */
async function titleOf(id: number | null) {
  if (!id) return null;
  if (titles.has(id)) return titles.get(id) ?? null;
  try {
    const title = (await getAnime(id))?.title ?? null;
    titles.set(id, title);
    return title;
  } catch {
    return null;
  }
}

/** GET /api/internal/stats: traffic, players and "Ver juntos" rooms, for the control panel only */
export async function GET(request: NextRequest) {
  if (!isPanelRequest(request)) return new NextResponse("Not found", { status: 404 });
  const rooms = await Promise.all(
    listParties().map(async (room) => ({ ...room, title: await titleOf(room.state.animeId) }))
  );
  return NextResponse.json({ ...statsSnapshot(), rooms, now: Date.now() }, { headers: { "Cache-Control": "no-store" } });
}
