import { NextRequest } from "next/server";
import { findParty, listen, memberNames } from "@/lib/watch-party/store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const PING_MS = 25_000;

/** GET /api/party/events?code=&member=: Server-Sent Events with the room's changes and who's in it */
export async function GET(request: NextRequest) {
  const party = findParty(request.nextUrl.searchParams.get("code"));
  const memberId = request.nextUrl.searchParams.get("member") || "";
  if (!party || !party.members.has(memberId)) return new Response("Unknown room or member", { status: 404 });

  const encoder = new TextEncoder();
  let cleanup = () => {};
  const stream = new ReadableStream({
    start(controller) {
      const write = (chunk: string) => {
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          cleanup();
        }
      };
      write(`data: ${JSON.stringify({ type: "state", state: party.state, serverNow: Date.now() })}\n\n`);
      const stop = listen(party, memberId, (event) => write(`data: ${JSON.stringify(event)}\n\n`));
      write(`data: ${JSON.stringify({ type: "members", names: memberNames(party) })}\n\n`);
      const ping = setInterval(() => write(": ping\n\n"), PING_MS);
      cleanup = () => {
        clearInterval(ping);
        stop?.();
        try {
          controller.close();
        } catch {}
      };
      request.signal.addEventListener("abort", () => cleanup());
    },
    cancel() {
      cleanup();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
