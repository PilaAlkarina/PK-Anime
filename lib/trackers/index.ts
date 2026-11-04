import { aniList } from "./anilist";
import { myAnimeList } from "./myanimelist";
import type { Tracker, TrackerId } from "./types";

export const TRACKERS: Record<TrackerId, Tracker> = {
  myanimelist: myAnimeList,
  anilist: aniList,
};

/**
 * Without a database the session can't say which provider it came from, so lib/auth.ts gives
 * each provider's users a placeholder email on the reserved .invalid TLD whose domain names
 * the provider: mal-123@myanimelist.invalid, anilist-123@anilist.invalid.
 */
export function trackerFromEmail(email: string | null | undefined): Tracker | null {
  const domain = email?.split("@")[1];
  if (!domain?.endsWith(".invalid")) return null;
  return TRACKERS[domain.slice(0, -".invalid".length) as TrackerId] ?? null;
}

/** Providers the sign-in screens offer: only those with credentials configured */
export function configuredTrackers(): { id: TrackerId; name: string }[] {
  const configured: { id: TrackerId; name: string }[] = [];
  if (process.env.MAL_CLIENT_ID && process.env.MAL_CLIENT_SECRET) configured.push({ id: "myanimelist", name: "MyAnimeList" });
  if (process.env.ANILIST_CLIENT_ID && process.env.ANILIST_CLIENT_SECRET) configured.push({ id: "anilist", name: "AniList" });
  return configured;
}

export * from "./types";
