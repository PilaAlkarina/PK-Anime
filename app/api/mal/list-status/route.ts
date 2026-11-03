import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { resolveFromAniListId } from "@/lib/anime-resolver";

export const dynamic = "force-dynamic";

const MAL_API = "https://api.myanimelist.net/v2";

/**
 * Marks an episode as watched on the signed-in user's MyAnimeList list.
 * Never lowers the watched count, so rewatching an earlier episode leaves the list alone.
 */
export async function POST(request: NextRequest) {
  // The session cookie is SameSite=Lax, but reject cross-site callers explicitly as well
  const origin = request.headers.get("origin");
  if (origin && new URL(origin).host !== request.nextUrl.host) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const episode = Number(body.episode);
  let malId = Number(body.malId) || null;
  if (!malId && body.anilistId) {
    malId = (await resolveFromAniListId(Number(body.anilistId)))?.malId ?? null;
  }
  if (!malId || !Number.isInteger(episode) || episode < 1) {
    return NextResponse.json({ error: "A MAL or AniList ID and an episode are required" }, { status: 400 });
  }

  // Reads the MAL token from the encrypted account cookie, refreshing it when expired
  let token: Awaited<ReturnType<typeof getToken>>;
  try {
    token = await getToken(request);
  } catch {
    return NextResponse.json({ error: "Not signed in with MyAnimeList" }, { status: 401 });
  }
  const authHeader = { Authorization: `Bearer ${token.response.accessToken}` };

  const reply = (data: unknown, status = 200) => {
    const res = NextResponse.json(data, { status });
    // A refreshed token comes back as an updated account cookie
    for (const cookie of token.headers.getSetCookie()) res.headers.append("set-cookie", cookie);
    return res;
  };

  const animeRes = await fetch(`${MAL_API}/anime/${malId}?fields=num_episodes,my_list_status`, {
    headers: authHeader,
  });
  if (!animeRes.ok) return reply({ error: `MyAnimeList answered ${animeRes.status}` }, 502);
  const anime = await animeRes.json();

  const watched = anime.my_list_status?.num_episodes_watched ?? 0;
  if (watched >= episode) return reply({ updated: false, malId, watched });

  const total = anime.num_episodes || 0;
  const status = total && episode >= total ? "completed" : "watching";
  const updateRes = await fetch(`${MAL_API}/anime/${malId}/my_list_status`, {
    method: "PATCH",
    headers: { ...authHeader, "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ status, num_watched_episodes: String(episode) }),
  });
  if (!updateRes.ok) return reply({ error: `MyAnimeList answered ${updateRes.status}` }, 502);

  return reply({ updated: true, malId, watched: episode, status });
}

function getToken(request: NextRequest) {
  return auth.api.getAccessToken({
    body: { useAccountCookie: true },
    headers: request.headers,
    returnHeaders: true,
  });
}
