import { NextRequest, NextResponse } from "next/server";
import { isPanelRequest } from "@/lib/internal-auth";
import { closeParty } from "@/lib/watch-party/store";

export const dynamic = "force-dynamic";

/** POST /api/internal/rooms { close: "ABC123" }: closes a "Ver juntos" room, for the control panel only */
export async function POST(request: NextRequest) {
  if (!isPanelRequest(request)) return new NextResponse("Not found", { status: 404 });
  const body = await request.json().catch(() => ({}));
  const closed = closeParty(body?.close);
  return NextResponse.json({ ok: closed }, { status: closed ? 200 : 404 });
}
