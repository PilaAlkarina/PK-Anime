import { NextRequest } from "next/server";
import { findByTv, takeProfile } from "@/lib/pairing/store";
import { isCrossSite, pairJson } from "@/lib/pairing/http";

export const dynamic = "force-dynamic";

/** POST /api/pair/profile/accept { tvToken }: the TV picks up the profile its phone sent */
export async function POST(request: NextRequest) {
  if (isCrossSite(request)) return pairJson({ success: false, error: "Forbidden" }, 403);
  const body = await request.json().catch(() => ({}));
  const link = findByTv(body.tvToken);
  const json = link ? takeProfile(link) : null;
  if (!json) return pairJson({ success: false, error: "No profile waiting for this TV" }, 404);
  return pairJson({ success: true, profile: JSON.parse(json) });
}
