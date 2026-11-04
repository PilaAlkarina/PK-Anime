import { createStore, readJSON } from "@/lib/library/storage";
import type { SubtitleStyles } from "@/components/player/subtitle-settings-dialog";
import { DEFAULT_SUBTITLE_STYLES } from "@/components/player/player-core/subtitle-style";

/**
 * Playback preferences, edited in the library's Ajustes screen and read by the player
 * wherever it runs on this origin. Stored per browser in localStorage.
 */

export type AudioPreference = "sub" | "dub";
export type ServerPreference = "auto" | "flow" | "kitty" | "yuri" | "zuri" | "buzz";
/** What to show over dubbed audio: full subtitles, signs/songs only, or nothing */
export type DubSubtitleMode = "full" | "forced" | "off";

export interface PlaybackPreferences {
  audio: AudioPreference;
  subtitlesEnabled: boolean;
  /** ISO 639-1 codes, most wanted first; the next one is the fallback */
  subtitleLanguages: string[];
  dubSubtitles: DubSubtitleMode;
  /** Change server when the wanted language is only available on another one */
  switchServerForSubtitles: boolean;
  preferredServer: ServerPreference;
  subtitleStyles: SubtitleStyles;
  /** Start the next episode after a short countdown when the ending begins */
  autoplayNext: boolean;
}

export const SERVER_ORDER: Exclude<ServerPreference, "auto">[] = ["flow", "kitty", "buzz", "yuri", "zuri"];

function defaultLanguages(): string[] {
  const browser = typeof navigator !== "undefined" ? navigator.language.slice(0, 2).toLowerCase() : "";
  return browser && browser !== "en" ? [browser, "en"] : ["es", "en"];
}

export function defaultPlaybackPreferences(): PlaybackPreferences {
  return {
    audio: "sub",
    subtitlesEnabled: true,
    subtitleLanguages: defaultLanguages(),
    dubSubtitles: "full",
    switchServerForSubtitles: true,
    preferredServer: "auto",
    subtitleStyles: DEFAULT_SUBTITLE_STYLES,
    autoplayNext: true,
  };
}

function normalize(stored: unknown): PlaybackPreferences {
  const defaults = defaultPlaybackPreferences();
  if (stored && typeof stored === "object") {
    const prefs = stored as Partial<PlaybackPreferences>;
    return {
      ...defaults,
      ...prefs,
      subtitleStyles: { ...defaults.subtitleStyles, ...prefs.subtitleStyles },
    };
  }
  // First run: carry over the Sub/Dub choice and subtitle styling saved before this store
  return {
    ...defaults,
    audio: readJSON<AudioPreference>("pk_library_audio", defaults.audio),
    subtitleStyles: { ...defaults.subtitleStyles, ...readJSON<Partial<SubtitleStyles>>("anime_subtitle_styles", {}) },
  };
}

const store = createStore<PlaybackPreferences>("pk_playback_prefs", defaultPlaybackPreferences(), normalize);

export const usePlaybackPreferences = store.useValue;
export const getPlaybackPreferences = store.get;

export function updatePlaybackPreferences(patch: Partial<PlaybackPreferences>) {
  store.set({ ...store.get(), ...patch });
}

export function resetPlaybackPreferences() {
  store.set(defaultPlaybackPreferences());
}
