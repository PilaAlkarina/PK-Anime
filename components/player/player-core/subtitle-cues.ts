/**
 * Cue text as the player shows it. Providers often leave ASS override blocks ({\an8}, {\i1}…) in
 * their VTT and SRT files too, so every format goes through here: the blocks go, and the one that
 * places the line at the top of the screen (signs, a second speaker) is kept as `top`.
 */
export interface CleanCue {
  text: string;
  top: boolean;
}

// {\an7} {\an8} {\an9}: top row of the numpad layout; {\a5}–{\a7}: the same in old SSA
const TOP_ALIGNMENT = /\\an[789]|\\a[567](?!\d)/;

export function cleanCueText(raw: string, { ass = false }: { ass?: boolean } = {}): CleanCue {
  const blocks = raw.match(/\{[^}]*\}/g) || [];
  const top = blocks.some((block) => TOP_ALIGNMENT.test(block));
  const text = raw
    // {\p1} switches to vector drawing ("m 0 0 l 640 0 …") until {\p0}: shapes, not words
    .replace(/\{[^}]*\\p[1-9][^}]*\}[^{]*/g, "")
    // In ASS every {…} is an override or a comment; elsewhere only the ones that start with "\"
    .replace(ass ? /\{[^}]*\}/g : /\{\\[^}]*\}/g, "")
    // VTT/SRT markup: <i>, <c.yellow>, <00:00:01.000>
    .replace(/<[^>]*>/g, "")
    .replace(/\\N/gi, "\n")
    .replace(/\\h/gi, " ")
    .replace(/[ \t]+\n|\n[ \t]+/g, "\n")
    .trim();
  return { text, top };
}

/** VTT cue settings that put the line in the top half ("line:0", "line:10%") */
export function vttSettingsOnTop(settings: string[]): boolean {
  const line = settings.find((s) => s.startsWith("line:"));
  if (!line) return false;
  const value = line.slice(5).split(",")[0];
  if (value.endsWith("%")) return parseFloat(value) < 50;
  const n = parseInt(value, 10);
  // Line numbers count from the top when positive, from the bottom when negative
  return Number.isFinite(n) && n >= 0;
}
