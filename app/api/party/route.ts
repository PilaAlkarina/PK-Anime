import { NextRequest } from "next/server";
import { cleanName, createParty, publicIdOf, snapshot } from "@/lib/watch-party/store";
import { isCrossSite, pairJson } from "@/lib/pairing/http";

export const dynamic = "force-dynamic";

/** POST /api/party { name }: opens a "Ver juntos" room with this device as host */
export async function POST(request: NextRequest) {
  if (isCrossSite(request)) return pairJson({ success: false, error: "Forbidden" }, 403);
  const body = await request.json().catch(() => ({}));
  const created = createParty(cleanName(body.name));
  if (!created) return pairJson({ success: false, error: "Too many rooms open, try again later" }, 503);
  const { party, member } = created;
  return pairJson({ success: true, code: party.code, member, you: publicIdOf(party, member), party: snapshot(party) });
}
