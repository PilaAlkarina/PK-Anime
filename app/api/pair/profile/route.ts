import { NextRequest } from "next/server";
import { findByController, offerProfile } from "@/lib/pairing/store";
import { isCrossSite, pairJson } from "@/lib/pairing/http";

export const dynamic = "force-dynamic";

/** A whole list with its history fits well under this */
const MAX_BYTES = 4 * 1024 * 1024;

/**
 * POST /api/pair/profile { token, profile }: the phone sends its profile (Mi lista, the watch
 * history and episode progress) to the linked TV, which asks what to do with it and takes it
 * from /api/pair/profile/accept. Kept in memory until then, and only once.
 */
export async function POST(request: NextRequest) {
  if (isCrossSite(request)) return pairJson({ success: false, error: "Forbidden" }, 403);
  const text = await request.text().catch(() => "");
  if (text.length > MAX_BYTES) return pairJson({ success: false, error: "Profile too large" }, 413);
  let body: any;
  try {
    body = JSON.parse(text);
  } catch {
    return pairJson({ success: false, error: "Invalid JSON" }, 400);
  }
  const link = findByController(body?.token);
  if (!link) return pairJson({ success: false, code: "NOT_LINKED", error: "This phone is not linked" }, 404);
  const profile = body.profile;
  if (!profile || typeof profile !== "object" || !Array.isArray(profile.entries) || !Array.isArray(profile.history)) {
    return pairJson({ success: false, error: "Invalid profile" }, 400);
  }
  const name = typeof profile.name === "string" && profile.name.trim() ? profile.name.trim().slice(0, 16) : "Móvil";
  offerProfile(link, JSON.stringify(profile), { name, entries: profile.entries.length, history: profile.history.length });
  return pairJson({ success: true, delivered: link.listeners.size > 0 });
}
