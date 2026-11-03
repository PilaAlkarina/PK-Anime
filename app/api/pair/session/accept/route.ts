import { NextRequest } from "next/server";
import { findByTv, takeSession } from "@/lib/pairing/store";
import { applySessionCookies, isCrossSite, pairJson } from "@/lib/pairing/http";

export const dynamic = "force-dynamic";

/** POST /api/pair/session/accept { tvToken }: the TV picks up the session its phone offered */
export async function POST(request: NextRequest) {
  if (isCrossSite(request)) return pairJson({ success: false, error: "Forbidden" }, 403);
  const body = await request.json().catch(() => ({}));
  const link = findByTv(body.tvToken);
  const cookies = link ? takeSession(link) : null;
  if (!cookies) return pairJson({ success: false, error: "No session waiting for this TV" }, 404);

  const res = pairJson({ success: true });
  if (applySessionCookies(request, res, cookies) === 0) {
    return pairJson({ success: false, error: "The session needs HTTPS on this TV" }, 400);
  }
  return res;
}
