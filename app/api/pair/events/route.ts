import { NextRequest } from "next/server";
import { findByTv, linkState, subscribe } from "@/lib/pairing/store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const PING_MS = 25_000;

/** GET /api/pair/events?tv={tvToken}: Server-Sent Events for the TV (linked, commands, session) */
export async function GET(request: NextRequest) {
  const link = findByTv(request.nextUrl.searchParams.get("tv"));
  if (!link) return new Response("Unknown link", { status: 404 });

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
      write(`data: ${JSON.stringify({ type: "state", ...linkState(link) })}\n\n`);
      const unsubscribe = subscribe(link, (event) => write(`data: ${JSON.stringify(event)}\n\n`));
      // Keeps proxies and the TV browser from closing an idle connection
      const ping = setInterval(() => write(": ping\n\n"), PING_MS);
      cleanup = () => {
        clearInterval(ping);
        unsubscribe();
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
      // no-transform stops response compression from buffering the stream
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
