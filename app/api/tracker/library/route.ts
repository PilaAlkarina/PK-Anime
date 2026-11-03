import { NextRequest } from "next/server";
import { getCardsByMalIds } from "@/lib/anilist/catalog";
import type { CatalogItem } from "@/lib/anilist/types";
import { TrackerError } from "@/lib/trackers";
import { getTrackerSession, notSignedIn, trackerJson } from "@/lib/trackers/session";

export const dynamic = "force-dynamic";

// Statuses the library shows as cards ("Seguir viendo", "Mi lista"); others only need IDs
const CARD_STATUSES = new Set(["watching", "planning"]);

/**
 * GET /api/tracker/library: the whole remote list. Every entry comes with its IDs and
 * status; watching and planned ones also come with a catalog card in `anime`.
 */
export async function GET(request: NextRequest) {
  const session = await getTrackerSession(request);
  if (!session) return notSignedIn();

  try {
    const entries = await session.tracker.getList(session.accessToken);
    const wanted = entries.filter((e) => CARD_STATUSES.has(e.status));
    const anime: CatalogItem[] = [];
    if (session.tracker.idKind === "mal") {
      const cards = await getCardsByMalIds(wanted.map((e) => e.malId!).filter(Boolean));
      for (const entry of wanted) {
        const card = entry.malId ? cards.get(entry.malId) : undefined;
        if (!card) continue;
        entry.anilistId = card.id;
        anime.push(card);
      }
    }
    return trackerJson(session, {
      success: true,
      provider: { id: session.tracker.id, name: session.tracker.name },
      entries,
      anime,
    });
  } catch (err) {
    const status = err instanceof TrackerError && err.status === 401 ? 401 : 502;
    return trackerJson(session, { success: false, code: "TRACKER_UNAVAILABLE", error: (err as Error).message }, status);
  }
}
