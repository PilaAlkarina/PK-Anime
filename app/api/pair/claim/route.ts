import { NextRequest } from "next/server";
import { claimLink, findByCode } from "@/lib/pairing/store";
import { isCrossSite, pairJson } from "@/lib/pairing/http";

export const dynamic = "force-dynamic";

/** POST /api/pair/claim { code }: the phone takes over the TV showing `code` */
export async function POST(request: NextRequest) {
  if (isCrossSite(request)) return pairJson({ success: false, error: "Forbidden" }, 403);
  const body = await request.json().catch(() => ({}));
  const link = findByCode(body.code);
  if (!link || link.controllerToken) {
    return pairJson({ success: false, code: "INVALID_CODE", error: "The code is wrong or has expired" }, 404);
  }
  return pairJson({ success: true, token: claimLink(link) });
}
