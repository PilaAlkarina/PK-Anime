import { createHash, timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";

/**
 * /api/internal/* answers only the control panel. `npm run serve` makes a new random token on each
 * start and hands it to the server it runs (PK_INTERNAL_TOKEN); the panel sends it back in this
 * header. Without the variable (npm run dev, next start by hand) those routes don't exist.
 */
export const INTERNAL_TOKEN_HEADER = "x-pk-panel-token";

const digest = (value: string) => createHash("sha256").update(value).digest();

export function isPanelRequest(request: NextRequest) {
  const expected = process.env.PK_INTERNAL_TOKEN;
  const given = request.headers.get(INTERNAL_TOKEN_HEADER);
  if (!expected || !given) return false;
  return timingSafeEqual(digest(given), digest(expected));
}
