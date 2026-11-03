import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { resolveFromAniListId, resolveFromMalId } from "@/lib/anime-resolver";
import { trackerFromEmail } from "./index";
import type { Tracker, TrackerIds } from "./types";

export interface TrackerSession {
  tracker: Tracker;
  accessToken: string;
  user: { name: string; image: string | null };
  /** Set-Cookie headers from a token refresh, to be passed on with the reply */
  setCookies: string[];
}

/** The signed-in user's tracker and a valid access token, or null when signed out */
export async function getTrackerSession(request: NextRequest): Promise<TrackerSession | null> {
  const session = await auth.api.getSession({ headers: request.headers }).catch(() => null);
  const tracker = trackerFromEmail(session?.user.email);
  if (!session || !tracker) return null;
  try {
    // Reads the token from the encrypted account cookie, refreshing it when expired
    const token = await auth.api.getAccessToken({
      body: { useAccountCookie: true },
      headers: request.headers,
      returnHeaders: true,
    });
    if (!token.response.accessToken) return null;
    return {
      tracker,
      accessToken: token.response.accessToken,
      user: { name: session.user.name, image: session.user.image ?? null },
      setCookies: token.headers.getSetCookie(),
    };
  } catch {
    return null;
  }
}

/** Private JSON reply that carries any refreshed token cookie */
export function trackerJson(session: TrackerSession | null, body: Record<string, unknown>, status = 200) {
  const res = NextResponse.json(body, { status, headers: { "Cache-Control": "private, no-store" } });
  for (const cookie of session?.setCookies ?? []) res.headers.append("set-cookie", cookie);
  return res;
}

export function notSignedIn() {
  return trackerJson(null, { success: false, code: "NOT_SIGNED_IN", error: "Not signed in to a list service" }, 401);
}

/** Session cookies are SameSite=Lax, but writes reject cross-site callers explicitly as well */
export function isCrossSite(request: NextRequest) {
  const origin = request.headers.get("origin");
  return !!origin && new URL(origin).host !== request.nextUrl.host;
}

/** Fills in the ID the tracker needs (MAL or AniList) from the one the caller sent */
export async function resolveTrackerIds(tracker: Tracker, ids: TrackerIds): Promise<TrackerIds> {
  if (tracker.idKind === "mal" && !ids.malId && ids.anilistId) {
    return { ...ids, malId: (await resolveFromAniListId(ids.anilistId))?.malId ?? null };
  }
  if (tracker.idKind === "anilist" && !ids.anilistId && ids.malId) {
    return { ...ids, anilistId: (await resolveFromMalId(ids.malId))?.anilistId ?? null };
  }
  return ids;
}

export function parseIds(body: { anilistId?: unknown; malId?: unknown }): TrackerIds {
  const anilistId = Number(body.anilistId);
  const malId = Number(body.malId);
  return {
    anilistId: Number.isInteger(anilistId) && anilistId > 0 ? anilistId : null,
    malId: Number.isInteger(malId) && malId > 0 ? malId : null,
  };
}
