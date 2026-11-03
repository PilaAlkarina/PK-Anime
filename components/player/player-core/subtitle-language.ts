/**
 * Subtitle language detection.
 *
 * Providers label tracks freely: "English (English Forced [MTBB])", "Spanish (Spanish (LA)
 * [Crunchyroll])", "Language (enm) (English [Honorific] [MTBB])", "English 2", "spa"…
 * Preferences are stored as ISO 639-1 codes, so every label is reduced to one.
 *
 * Dependency-free: shared by the player and the library settings screen.
 */

export interface SubtitleLanguage {
  code: string;
  /** Name shown in the library settings (Spanish UI) */
  name: string;
}

/** Languages offered in the settings screen, roughly by how often providers ship them */
export const SUBTITLE_LANGUAGES: SubtitleLanguage[] = [
  { code: "es", name: "Español" },
  { code: "en", name: "Inglés" },
  { code: "pt", name: "Portugués" },
  { code: "fr", name: "Francés" },
  { code: "de", name: "Alemán" },
  { code: "it", name: "Italiano" },
  { code: "ar", name: "Árabe" },
  { code: "ru", name: "Ruso" },
  { code: "id", name: "Indonesio" },
  { code: "th", name: "Tailandés" },
  { code: "vi", name: "Vietnamita" },
  { code: "ms", name: "Malayo" },
  { code: "pl", name: "Polaco" },
  { code: "tr", name: "Turco" },
  { code: "zh", name: "Chino" },
  { code: "ko", name: "Coreano" },
  { code: "hi", name: "Hindi" },
  { code: "ja", name: "Japonés" },
];

export function subtitleLanguageName(code: string): string {
  return SUBTITLE_LANGUAGES.find((l) => l.code === code)?.name || code.toUpperCase();
}

// Words that identify a language anywhere in a label (names in English and natively, plus
// ISO 639-2 codes). Two-letter codes are only trusted when they are the whole label.
const LANGUAGE_WORDS: Record<string, string[]> = {
  en: ["english", "inglés", "ingles", "eng"],
  es: ["spanish", "español", "espanol", "castellano", "latino", "spa"],
  pt: ["portuguese", "português", "portugues", "brazilian", "por"],
  fr: ["french", "français", "francais", "fre", "fra"],
  de: ["german", "deutsch", "ger", "deu"],
  it: ["italian", "italiano", "ita"],
  ar: ["arabic", "ara"],
  ru: ["russian", "русский", "rus"],
  id: ["indonesian", "indonesia", "ind"],
  th: ["thai", "tha"],
  vi: ["vietnamese", "vie"],
  ms: ["malay", "melayu", "may", "msa"],
  pl: ["polish", "polski", "pol"],
  tr: ["turkish", "türkçe", "tur"],
  zh: ["chinese", "mandarin", "chi", "zho"],
  ko: ["korean", "kor"],
  hi: ["hindi", "hin"],
  ja: ["japanese", "jpn"],
};

const WORD_TO_CODE = new Map<string, string>();
for (const [code, words] of Object.entries(LANGUAGE_WORDS)) {
  for (const word of words) WORD_TO_CODE.set(word, code);
}

/** ISO 639-1 code of a track, from its label and language fields; null when unrecognised */
export function detectSubtitleLanguage(track: { label?: string | null; language?: string | null }): string | null {
  for (const raw of [track.label, track.language]) {
    const text = (raw || "").toLowerCase().trim();
    if (!text) continue;
    // "es", "en-US", "pt_BR"
    const bare = text.match(/^([a-z]{2})(?:[-_][a-z]{2,4})?$/);
    if (bare && LANGUAGE_WORDS[bare[1]]) return bare[1];
    // First recognised word wins: "Language (enm) (English …)" → English
    for (const word of text.split(/[^\p{L}]+/u)) {
      const code = WORD_TO_CODE.get(word);
      if (code) return code;
    }
  }
  return null;
}

/** Forced tracks only translate signs and songs; they are meant for dubbed audio */
export function isForcedSubtitle(track: { label?: string | null; language?: string | null }): boolean {
  return /\b(forced|signs|songs)\b/i.test(`${track.label || ""} ${track.language || ""}`);
}
