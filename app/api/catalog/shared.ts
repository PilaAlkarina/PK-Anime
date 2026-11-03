import { NextResponse } from "next/server";

/** JSON reply that a CDN may also cache; the AniList data behind it is cached server-side anyway */
export function catalogJson(body: Record<string, unknown>, maxAge: number) {
  return NextResponse.json(
    { success: true, ...body },
    { headers: { "Cache-Control": `public, s-maxage=${maxAge}, stale-while-revalidate=${maxAge * 4}` } }
  );
}

export function catalogError(status: number, code: string, error: string) {
  return NextResponse.json({ success: false, code, error }, { status });
}

export function upstreamError(err: unknown) {
  console.warn("[catalog] AniList request failed:", err instanceof Error ? err.message : err);
  return catalogError(502, "ANILIST_UNAVAILABLE", "AniList is not responding, try again shortly");
}
