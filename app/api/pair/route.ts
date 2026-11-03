import { NextRequest } from "next/server";
import { createLink, findByTv, linkState } from "@/lib/pairing/store";
import { isCrossSite, linkUrl, pairJson, qrSvg } from "@/lib/pairing/http";

export const dynamic = "force-dynamic";

/**
 * POST /api/pair { tvToken?, create? }: the TV's link. Returns the existing one for `tvToken`,
 * or a new pending one (with its QR) when there is none and `create` is true.
 */
export async function POST(request: NextRequest) {
  if (isCrossSite(request)) return pairJson({ success: false, error: "Forbidden" }, 403);
  const body = await request.json().catch(() => ({}));

  let link = findByTv(body.tvToken);
  if (!link) {
    if (!body.create) return pairJson({ success: true, status: "missing" });
    link = createLink();
    if (!link) return pairJson({ success: false, error: "Too many pending links, try again later" }, 503);
  }

  const state = linkState(link);
  const url = state.code ? linkUrl(request, state.code) : null;
  return pairJson({
    success: true,
    tvToken: link.tvToken,
    ...state,
    url,
    qr: url ? await qrSvg(url) : null,
  });
}
