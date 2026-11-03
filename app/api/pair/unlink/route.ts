import { NextRequest } from "next/server";
import { findByController, findByTv, unlink } from "@/lib/pairing/store";
import { isCrossSite, pairJson } from "@/lib/pairing/http";

export const dynamic = "force-dynamic";

/** POST /api/pair/unlink { tvToken } or { token }: either side ends the link */
export async function POST(request: NextRequest) {
  if (isCrossSite(request)) return pairJson({ success: false, error: "Forbidden" }, 403);
  const body = await request.json().catch(() => ({}));
  const link = findByTv(body.tvToken) || findByController(body.token);
  if (link) unlink(link);
  return pairJson({ success: true });
}
