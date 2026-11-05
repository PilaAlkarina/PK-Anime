export const dynamic = "force-dynamic";

/** GET /api/party/clock: the server's time, ms, for estimating each device's clock offset */
export function GET() {
  return new Response(JSON.stringify({ now: Date.now() }), {
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}
