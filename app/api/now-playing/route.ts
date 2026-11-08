import { NextRequest, NextResponse } from "next/server";
import { notePlaying } from "@/lib/server-stats";
import { isCrossSite } from "@/lib/request-origin";

export const dynamic = "force-dynamic";

/**
 * POST /api/now-playing: an open player says what it's playing (anime, episode, server, position),
 * every few seconds while it plays and once more when it stops. Only the control panel reads it.
 */
export async function POST(request: NextRequest) {
  if (isCrossSite(request)) return new NextResponse(null, { status: 403 });
  const text = await request.text().catch(() => "");
  if (text.length > 2048) return new NextResponse(null, { status: 413 });
  try {
    notePlaying(request, JSON.parse(text || "{}"));
  } catch {
    return new NextResponse(null, { status: 400 });
  }
  return new NextResponse(null, { status: 204 });
}
