/**
 * Applies the viewer's playback preferences: which subtitle track to show, and which tracks
 * count for a language. The server choice (lib/server-choice.ts) ranks servers with the same rules.
 *
 * Dependency-free apart from the other player-core helpers.
 */

import { detectSubtitleLanguage, isForcedSubtitle, subtitleVariantRank } from "./subtitle-language";
import { getServerScopeKey, type ScopableSource } from "./subtitle-scope";

export type ServerCode = "flow" | "kitty" | "yuri" | "zuri" | "buzz";

/** Subset of the playback preferences these helpers read */
export interface SubtitlePreferences {
  subtitlesEnabled: boolean;
  subtitleLanguages: string[];
  dubSubtitles: "full" | "forced" | "off";
  switchServerForSubtitles: boolean;
  preferredServer: ServerCode | "auto";
}

interface TrackLike {
  id?: string | null;
  url?: string | null;
  subtitleUrl?: string | null;
  label?: string | null;
  language?: string | null;
  default?: boolean | null;
  isDefault?: boolean | null;
}

const SCOPE_TO_SERVER: Record<string, ServerCode> = {
  "flow-1": "flow",
  "flow-2": "kitty",
  yuri: "yuri",
  zuri: "zuri",
  buzz: "buzz",
};

export function serverCodeOf(source: ScopableSource): ServerCode | null {
  return SCOPE_TO_SERVER[getServerScopeKey(source)] || null;
}

/** Whether a track is usable for this audio: full subtitles, or signs-only over a dub */
export function trackFits(track: TrackLike, audio: "sub" | "dub", prefs: SubtitlePreferences) {
  const forced = isForcedSubtitle(track);
  return audio === "dub" && prefs.dubSubtitles === "forced" ? forced : !forced;
}

/** Languages that decide the track (and server), in order; empty when subtitles stay off */
export function wantedLanguages(audio: "sub" | "dub", prefs: SubtitlePreferences): string[] {
  if (!prefs.subtitlesEnabled || (audio === "dub" && prefs.dubSubtitles === "off")) return [];
  return prefs.subtitleLanguages;
}

function trackKey(track: TrackLike) {
  return track.id || track.url || track.subtitleUrl || "";
}

/**
 * Track to show for this audio, as its id (or url), or null for subtitles off.
 * Falls through the preferred languages in order; with none of them on offer it keeps the
 * provider's default (or English) for subbed audio, and turns signs-only tracks off.
 */
export function pickSubtitleTrack(
  tracks: TrackLike[],
  audio: "sub" | "dub",
  prefs: SubtitlePreferences
): string | null {
  if (tracks.length === 0) return null;
  if (!prefs.subtitlesEnabled || (audio === "dub" && prefs.dubSubtitles === "off")) return null;

  const fitting = tracks.filter((t) => trackFits(t, audio, prefs));
  for (const lang of wantedLanguages(audio, prefs)) {
    // Spanish from Spain before Latin American; then the provider's default
    const isDefault = (t: TrackLike) => (t.default || t.isDefault ? 0 : 1);
    const pick = fitting
      .filter((t) => detectSubtitleLanguage(t) === lang)
      .sort((a, b) => subtitleVariantRank(a) - subtitleVariantRank(b) || isDefault(a) - isDefault(b))[0];
    if (pick) return trackKey(pick);
  }

  if (audio === "dub" && prefs.dubSubtitles === "forced") return null;
  const pool = fitting.length > 0 ? fitting : tracks;
  const fallback =
    pool.find((t) => t.default || t.isDefault) || pool.find((t) => detectSubtitleLanguage(t) === "en") || pool[0];
  return trackKey(fallback);
}
