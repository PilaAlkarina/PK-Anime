/**
 * Applies the viewer's playback preferences: which subtitle track to show, and which server
 * to play from when the wanted subtitle language only exists on another server.
 *
 * Dependency-free apart from the other player-core helpers.
 */

import { detectSubtitleLanguage, isForcedSubtitle } from "./subtitle-language";
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

const DEFAULT_SERVER_ORDER: ServerCode[] = ["flow", "kitty", "buzz", "yuri", "zuri"];

export function serverCodeOf(source: ScopableSource): ServerCode | null {
  return SCOPE_TO_SERVER[getServerScopeKey(source)] || null;
}

/** Whether a track is usable for this audio: full subtitles, or signs-only over a dub */
function trackFits(track: TrackLike, audio: "sub" | "dub", prefs: SubtitlePreferences) {
  const forced = isForcedSubtitle(track);
  return audio === "dub" && prefs.dubSubtitles === "forced" ? forced : !forced;
}

/** Languages that decide the track (and server), in order; empty when subtitles stay off */
function wantedLanguages(audio: "sub" | "dub", prefs: SubtitlePreferences): string[] {
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
    const inLang = fitting.filter((t) => detectSubtitleLanguage(t) === lang);
    const pick = inLang.find((t) => t.default || t.isDefault) || inLang[0];
    if (pick) return trackKey(pick);
  }

  if (audio === "dub" && prefs.dubSubtitles === "forced") return null;
  const pool = fitting.length > 0 ? fitting : tracks;
  const fallback =
    pool.find((t) => t.default || t.isDefault) || pool.find((t) => detectSubtitleLanguage(t) === "en") || pool[0];
  return trackKey(fallback);
}

export interface ServerChoice {
  server: ServerCode;
  /** Subtitle language that made this server the choice, when it was the reason */
  language?: string;
}

/**
 * Server to play from. Walks the preferred languages in order and returns the first server
 * (preferred server first, then the current one) that has subtitles in it, so a language
 * offered only by another server is not missed. Servers whose tracks are not in the listing
 * (Yuri and Zuri only return subtitles when asked directly) are probed on demand.
 * Returns null to stay on the current server.
 */
export async function choosePreferredServer({
  sources,
  audio,
  currentServer,
  prefs,
  probeSubtitles,
}: {
  sources: Array<ScopableSource & { subtitles?: TrackLike[] | null }>;
  audio: "sub" | "dub";
  currentServer: string;
  prefs: SubtitlePreferences;
  probeSubtitles: (server: ServerCode) => Promise<TrackLike[]>;
}): Promise<ServerChoice | null> {
  const type = audio === "dub" ? "DUB" : "SUB";
  const tracksByServer = new Map<ServerCode, TrackLike[] | null>();
  for (const source of sources) {
    const code = serverCodeOf(source);
    if (!code || (source.type || "").toUpperCase() !== type) continue;
    const own = Array.isArray(source.subtitles) && source.subtitles.length > 0 ? source.subtitles : null;
    // A dub without its own tracks borrows its server's sub tracks (same encode)
    const borrowed =
      !own && type === "DUB"
        ? sources.find((s) => serverCodeOf(s) === code && (s.type || "").toUpperCase() === "SUB")?.subtitles
        : null;
    const tracks = own || (Array.isArray(borrowed) && borrowed.length > 0 ? borrowed : null);
    if (!tracksByServer.has(code) || (tracks && !tracksByServer.get(code))) tracksByServer.set(code, tracks);
  }
  if (tracksByServer.size === 0) return null;

  const current = DEFAULT_SERVER_ORDER.find((c) => currentServer.toLowerCase().includes(c)) || null;
  const order = [
    ...(prefs.preferredServer !== "auto" ? [prefs.preferredServer] : []),
    ...(current ? [current] : []),
    ...DEFAULT_SERVER_ORDER,
  ].filter((code, i, all) => all.indexOf(code) === i && tracksByServer.has(code));

  const hasLanguage = (tracks: TrackLike[] | null | undefined, lang: string) =>
    (tracks || []).some((t) => trackFits(t, audio, prefs) && detectSubtitleLanguage(t) === lang);

  const languages = prefs.switchServerForSubtitles ? wantedLanguages(audio, prefs) : [];
  const probed = new Set<ServerCode>();
  for (const lang of languages) {
    for (const code of order) {
      if (hasLanguage(tracksByServer.get(code), lang)) return code === current ? null : { server: code, language: lang };
    }
    // Not in the listing: ask the servers that came without tracks, once each
    const unknown = order.filter((code) => !tracksByServer.get(code) && !probed.has(code));
    const results = await Promise.all(unknown.map((code) => probeSubtitles(code).catch(() => [])));
    unknown.forEach((code, i) => {
      probed.add(code);
      tracksByServer.set(code, results[i]);
    });
    for (const code of unknown) {
      if (hasLanguage(tracksByServer.get(code), lang)) return code === current ? null : { server: code, language: lang };
    }
  }

  // No wanted language anywhere: honour the preferred server if it serves this audio
  if (prefs.preferredServer !== "auto" && prefs.preferredServer !== current && tracksByServer.has(prefs.preferredServer)) {
    return { server: prefs.preferredServer };
  }
  return null;
}
