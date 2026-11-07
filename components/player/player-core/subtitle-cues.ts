/**
 * Subtitle files as the player shows them: ASS/SSA, WebVTT and SRT read into cues with the little
 * styling worth keeping — italics, bold, where the line goes (the numpad's nine places) and, for
 * ASS typesetting, the exact spot and size of a sign — and nothing else (colors, fonts, rotation,
 * karaoke and drawings are dropped). Providers often leave ASS override blocks ({\an8}, {\i1}…) in
 * their VTT and SRT files too, so those are read everywhere.
 */

/** Numpad layout: 7 8 9 on top, 4 5 6 in the middle, 1 2 3 at the bottom */
export type CueAlign = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;

export interface CueSpan {
  text: string;
  italic?: boolean;
  bold?: boolean;
}

export interface SubtitleCue {
  start: number;
  end: number;
  /** Plain text, for matching duplicates */
  text: string;
  spans: CueSpan[];
  align: CueAlign;
  /** ASS \pos: the anchor point, as a share of the video's width and height */
  pos?: { x: number; y: number };
  /** With `pos`: the font size the file asks for, as a share of the video's height */
  size?: number;
  /** With `pos`: horizontal stretch (\fscx), 1 = none */
  scaleX?: number;
  /**
   * On-screen text translated in a burst (a form, a list of signs) that the file couldn't place:
   * many lines starting and ending together. Shown small and grouped instead of stacked.
   */
  sign?: boolean;
}

// ———————————————————————————————————————————— shared

/** Old SSA \a values (and V4 style alignments) to the numpad */
const LEGACY_ALIGN: Record<number, CueAlign> = { 1: 1, 2: 2, 3: 3, 5: 7, 6: 8, 7: 9, 9: 4, 10: 5, 11: 6 };

const toAlign = (n: number): CueAlign | null => (n >= 1 && n <= 9 ? (n as CueAlign) : null);

/** "0:01:02.50", "00:01:02,500", "01:02.500" → seconds */
function parseTime(value: string) {
  const parts = value.trim().split(":");
  const seconds = parseFloat((parts.pop() || "0").replace(",", ".")) || 0;
  return parts.reduce((total, part) => total * 60 + (parseInt(part, 10) || 0), 0) * 60 + seconds;
}

interface InlineState {
  italic: boolean;
  bold: boolean;
}

interface InlineResult {
  spans: CueSpan[];
  align: CueAlign | null;
  pos: { x: number; y: number } | null;
  fontSize: number | null;
  scaleX: number | null;
}

/**
 * Reads a cue's text: {\…} override blocks (ASS, and leftovers in VTT/SRT) and <i>/<b> tags (VTT,
 * SRT) set italics and bold as it goes; the rest of the markup is dropped. `reset` gives the style
 * to go back to on {\r}.
 */
function readInline(raw: string, base: InlineState, { ass, reset }: { ass: boolean; reset?: (name: string) => InlineState }): InlineResult {
  const out: InlineResult = { spans: [], align: null, pos: null, fontSize: null, scaleX: null };
  let state = { ...base };
  let drawing = false;
  const tagDepth = { i: 0, b: 0 };
  const push = (text: string) => {
    if (!text || drawing) return;
    const italic = state.italic || tagDepth.i > 0;
    const bold = state.bold || tagDepth.b > 0;
    const last = out.spans[out.spans.length - 1];
    if (last && !!last.italic === italic && !!last.bold === bold) last.text += text;
    else out.spans.push({ text, ...(italic && { italic }), ...(bold && { bold }) });
  };

  const tokens = raw.match(/\{[^}]*\}|<[^>]*>|[^{<]+|[{<]/g) || [];
  for (const token of tokens) {
    if (token.startsWith("{") && token.endsWith("}")) {
      // Outside ASS a {…} that isn't an override is just text
      if (!ass && !token.startsWith("{\\")) {
        push(token);
        continue;
      }
      for (const tag of token.slice(1, -1).split("\\").slice(1)) {
        let m: RegExpMatchArray | null;
        if ((m = tag.match(/^an(\d)/))) out.align ??= toAlign(+m[1]);
        else if ((m = tag.match(/^a(\d{1,2})$/))) out.align ??= LEGACY_ALIGN[+m[1]] ?? null;
        else if ((m = tag.match(/^(?:pos|move)\(\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)/))) out.pos ??= { x: +m[1], y: +m[2] };
        else if ((m = tag.match(/^fs(\d+(?:\.\d+)?)$/))) out.fontSize = +m[1];
        else if ((m = tag.match(/^fscx(\d+(?:\.\d+)?)$/))) out.scaleX = +m[1] / 100;
        else if ((m = tag.match(/^i([01])$/))) state.italic = m[1] === "1";
        else if ((m = tag.match(/^b(\d+)$/))) state.bold = +m[1] === 1 || +m[1] >= 600;
        else if ((m = tag.match(/^p(\d+)/))) drawing = +m[1] > 0;
        else if ((m = tag.match(/^r(.*)$/))) state = m[1] && reset ? reset(m[1].trim()) : { ...base };
      }
      continue;
    }
    if (token.startsWith("<") && token.endsWith(">")) {
      const m = token.match(/^<(\/)?([ib])(?:[\s.][^>]*)?>$/i);
      if (m) {
        const key = m[2].toLowerCase() as "i" | "b";
        tagDepth[key] = Math.max(0, tagDepth[key] + (m[1] ? -1 : 1));
      }
      continue;
    }
    push(
      token
        .replace(/\\N/g, "\n")
        // \n is a soft break (a space unless the script says otherwise), \h a hard space
        .replace(/\\n/g, " ")
        .replace(/\\h/g, " ")
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&nbsp;/g, " ")
    );
  }

  // Trim the whole cue, line by line, without losing the spans' styling
  const joined = out.spans.map((s) => s.text).join("");
  if (!joined.trim()) out.spans = [];
  else {
    out.spans = out.spans
      .map((s) => ({ ...s, text: s.text.replace(/[ \t]+\n/g, "\n").replace(/\n[ \t]+/g, "\n") }))
      .filter((s) => s.text);
    const first = out.spans[0];
    const last = out.spans[out.spans.length - 1];
    first.text = first.text.replace(/^\s+/, "");
    last.text = last.text.replace(/\s+$/, "");
    out.spans = out.spans.filter((s) => s.text);
  }
  return out;
}

const plainText = (spans: CueSpan[]) => spans.map((s) => s.text).join("");

// ———————————————————————————————————————————— ASS / SSA

interface AssStyle extends InlineState {
  align: CueAlign;
  fontSize: number;
  scaleX: number;
}

function parseAss(text: string): SubtitleCue[] {
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  let section = "";
  let playX = 0;
  let playY = 0;
  let styleFormat: string[] = [];
  let eventFormat = ["layer", "start", "end", "style", "name", "marginl", "marginr", "marginv", "effect", "text"];
  let legacyStyles = false;
  const styles = new Map<string, AssStyle>();
  const raw: { start: number; end: number; style: string; text: string }[] = [];

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (line.startsWith("[")) {
      section = line.toLowerCase();
      legacyStyles = section === "[v4 styles]";
      continue;
    }
    const colon = line.indexOf(":");
    if (colon < 0) continue;
    const key = line.slice(0, colon).trim().toLowerCase();
    const value = line.slice(colon + 1).trim();

    if (section === "[script info]") {
      if (key === "playresx") playX = parseFloat(value) || 0;
      if (key === "playresy") playY = parseFloat(value) || 0;
    } else if (section.includes("styles")) {
      if (key === "format") styleFormat = value.split(",").map((f) => f.trim().toLowerCase());
      else if (key === "style") {
        const fields = value.split(",");
        const get = (name: string) => fields[styleFormat.indexOf(name)]?.trim() ?? "";
        const alignment = parseInt(get("alignment"), 10);
        styles.set(get("name") || "Default", {
          italic: get("italic") === "-1" || get("italic") === "1",
          bold: get("bold") === "-1" || get("bold") === "1",
          align: (legacyStyles ? LEGACY_ALIGN[alignment] : toAlign(alignment)) ?? 2,
          fontSize: parseFloat(get("fontsize")) || 0,
          scaleX: (parseFloat(get("scalex")) || 100) / 100,
        });
      }
    } else if (section === "[events]") {
      if (key === "format") eventFormat = value.split(",").map((f) => f.trim().toLowerCase());
      else if (key === "dialogue") {
        // The text is the last field and may hold commas itself
        const fields = value.split(",");
        const textAt = eventFormat.indexOf("text");
        const get = (name: string) => fields[eventFormat.indexOf(name)]?.trim() ?? "";
        raw.push({
          start: parseTime(get("start")),
          end: parseTime(get("end")),
          style: get("style").replace(/^\*/, ""),
          text: fields.slice(textAt < 0 ? 9 : textAt).join(","),
        });
      }
    }
  }

  // Without a PlayRes the spec's default canvas applies; with one missing, the other follows 4:3
  if (!playX && !playY) [playX, playY] = [384, 288];
  else if (!playX) playX = playY === 1024 ? 1280 : (playY * 4) / 3;
  else if (!playY) playY = playX === 1280 ? 1024 : (playX * 3) / 4;

  const fallback: AssStyle = { italic: false, bold: false, align: 2, fontSize: 0, scaleX: 1 };
  const styleOf = (name: string) => styles.get(name) ?? styles.get("Default") ?? fallback;

  const cues: SubtitleCue[] = [];
  const seen = new Set<string>();
  for (const event of raw) {
    if (!(event.end > event.start)) continue;
    const style = styleOf(event.style);
    const inline = readInline(event.text, style, { ass: true, reset: (name) => styleOf(name) });
    if (inline.spans.length === 0) continue;
    const text = plainText(inline.spans);
    const align = inline.align ?? style.align;
    const pos = inline.pos ? { x: inline.pos.x / playX, y: inline.pos.y / playY } : undefined;
    // Typesetting often draws a sign twice or more (glow, border, text): one is enough
    const key = `${event.start}|${event.end}|${text}|${pos ? `${pos.x.toFixed(3)},${pos.y.toFixed(3)}` : align}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const fontSize = inline.fontSize ?? style.fontSize;
    cues.push({
      start: event.start,
      end: event.end,
      text,
      spans: inline.spans,
      align,
      ...(pos && {
        pos,
        ...(fontSize > 0 && { size: fontSize / playY }),
        scaleX: inline.scaleX ?? style.scaleX,
      }),
    });
  }
  return cues;
}

// ———————————————————————————————————————————— WebVTT / SRT

/** Where VTT cue settings put a line: line: picks the row, align:/position: the column */
function vttAlign(settings: string[]): CueAlign | null {
  const get = (name: string) => settings.find((s) => s.startsWith(`${name}:`))?.slice(name.length + 1).split(",")[0];
  const line = get("line");
  const align = get("align");
  const position = get("position");
  if (!line && !align && !position) return null;

  let row = 0; // 0 bottom, 1 middle, 2 top
  if (line) {
    if (line.endsWith("%")) {
      const p = parseFloat(line);
      row = p < 33 ? 2 : p < 67 ? 1 : 0;
    } else {
      // Line numbers count from the top when positive, from the bottom when negative
      const n = parseInt(line, 10);
      row = Number.isFinite(n) && n >= 0 ? 2 : 0;
    }
  }
  let col = 1; // 0 left, 1 center, 2 right
  if (align === "left" || align === "start") col = 0;
  else if (align === "right" || align === "end") col = 2;
  else if (position?.endsWith("%")) {
    const p = parseFloat(position);
    col = p < 30 ? 0 : p > 70 ? 2 : 1;
  }
  return (row * 3 + col + 1) as CueAlign;
}

function parseVttOrSrt(text: string): SubtitleCue[] {
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  const cues: SubtitleCue[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i].trim();
    i++;
    if (!line.includes("-->")) continue;
    // NOTE and STYLE blocks never hold "-->"; a cue's identifier line is skipped by this search
    const [startPart, endPart] = line.split("-->");
    const [endToken, ...settings] = (endPart || "").trim().split(/\s+/);
    const start = parseTime(startPart.trim().split(/\s+/)[0]);
    const end = parseTime(endToken || "0");
    const body: string[] = [];
    while (i < lines.length && lines[i].trim() !== "") {
      body.push(lines[i].trim());
      i++;
    }
    if (!(end > start)) continue;
    const inline = readInline(body.join("\n"), { italic: false, bold: false }, { ass: false });
    if (inline.spans.length === 0) continue;
    cues.push({
      start,
      end,
      text: plainText(inline.spans),
      spans: inline.spans,
      align: inline.align ?? vttAlign(settings) ?? 2,
    });
  }
  markSignBursts(cues);
  return cues;
}

/** Lines that share a start and an end with at least this many others are a burst of signs */
const BURST = 3;

/**
 * A file converted from ASS without the positions (a form, a wall of signs) turns its typesetting
 * into many lines that start and end together. Those, and fully bold lines shown during them, are
 * marked `sign`, so the player can group them small instead of stacking them over the picture.
 */
function markSignBursts(cues: SubtitleCue[]) {
  const groups = new Map<string, SubtitleCue[]>();
  for (const cue of cues) {
    const key = `${cue.start}|${cue.end}`;
    const group = groups.get(key);
    if (group) group.push(cue);
    else groups.set(key, [cue]);
  }
  const bursts: { start: number; end: number }[] = [];
  for (const group of groups.values()) {
    if (group.length < BURST) continue;
    for (const cue of group) cue.sign = true;
    bursts.push({ start: group[0].start, end: group[0].end });
  }
  if (bursts.length === 0) return;
  for (const cue of cues) {
    if (cue.sign || !cue.spans.every((s) => s.bold)) continue;
    if (bursts.some((b) => cue.start < b.end && cue.end > b.start)) cue.sign = true;
  }
}

/** Any subtitle file (ASS/SSA, WebVTT or SRT) into the player's cues */
export function parseSubtitles(text: string): SubtitleCue[] {
  const isAss = text.includes("[Script Info]") || /^\s*Dialogue:/m.test(text);
  return isAss ? parseAss(text) : parseVttOrSrt(text);
}

// ———————————————————————————————————————————— plain text (the proxy's VTT conversion)

/**
 * Cue text without markup, and whether the line goes at the top of the screen: for converting a
 * file to VTT elsewhere (downloads, other players).
 */
export interface CleanCue {
  text: string;
  top: boolean;
}

export function cleanCueText(raw: string, { ass = false }: { ass?: boolean } = {}): CleanCue {
  const inline = readInline(raw, { italic: false, bold: false }, { ass });
  const align = inline.align ?? 2;
  return { text: plainText(inline.spans), top: align >= 7 };
}

/** VTT cue settings that put the line in the top half ("line:0", "line:10%") */
export function vttSettingsOnTop(settings: string[]): boolean {
  return (vttAlign(settings) ?? 2) >= 7;
}
