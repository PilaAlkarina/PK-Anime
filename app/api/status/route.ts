import { NextRequest, NextResponse } from "next/server";
import { getStatus, peekStatus } from "@/lib/status";

export const dynamic = "force-dynamic";
// A full check fetches a playlist and a segment from every server
export const maxDuration = 60;

/**
 * GET /api/status: live health of the stream servers, AniList and AniSkip, re-checked at most
 * every 5 minutes. ?refresh=1 forces a new check (ignored within a minute of the last one);
 * ?peek=1 only returns the last report, or none, and never starts a check.
 */
export async function GET(request: NextRequest) {
  const force = request.nextUrl.searchParams.get("refresh") === "1";
  if (request.nextUrl.searchParams.get("peek") === "1") {
    const report = peekStatus();
    return NextResponse.json(
      report ? { success: true, ...report } : { success: true, checkedAt: null, services: [], httpFallbackHosts: [] },
      { headers: { "Cache-Control": "no-store" } }
    );
  }
  try {
    const report = await getStatus(request.nextUrl.origin, { force });
    return NextResponse.json({ success: true, ...report }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "Status check failed" },
      { status: 500 }
    );
  }
}
