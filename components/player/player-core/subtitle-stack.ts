import type { CueAlign, SubtitleCue } from "./subtitle-cues";

/**
 * Where each line of dialogue sits while it shows, worked out for the whole file up front, so a
 * line never moves once it's on screen. Lines in the same place that overlap in time are stacked:
 * the earlier one above the later one, as they're read. A line that a later one will join before
 * it goes therefore appears already raised, with the room the later one will take left empty,
 * instead of showing at the bottom and being pushed up when the other arrives (and dropping back
 * when it goes). At the top of the screen the stack grows downwards instead.
 *
 * The same text shown again while it's still there (an echo effect, two copies with a stray
 * period) is one line. On-screen text set in bold (`screen`) goes above the dialogue it shows with.
 */

export interface StackItem {
  /** The cues shown as this line: one, or the copies of the same text */
  cues: SubtitleCue[];
  /** The cue whose text and style are shown */
  lead: SubtitleCue;
  start: number;
  end: number;
  screen: boolean;
  /** Distance from the stack's base (bottom row: from the bottom; top row: from the top), in px */
  offset: number;
  /** Height measured for it, in px */
  height: number;
}

/** Text compared without case, spacing or punctuation */
const sameTextKey = (text: string) => text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");

const overlaps = (a: { start: number; end: number }, b: { start: number; end: number }) => a.start < b.end && b.start < a.end;

/**
 * Lays out the cues of one place on screen (one `align`). `heightOf` measures a line as it will
 * be drawn; `gap` is the space above the dialogue left before on-screen text. `fromTop` for the
 * top row.
 */
export function stackRegion(
  cues: SubtitleCue[],
  heightOf: (cue: SubtitleCue) => number,
  { gap, fromTop }: { gap: number; fromTop: boolean }
): StackItem[] {
  const sorted = [...cues].sort((a, b) => a.start - b.start || a.end - b.end);
  const items: StackItem[] = [];
  const open = new Map<string, StackItem>();
  for (const cue of sorted) {
    const screen = !!cue.screen;
    const key = `${screen ? "s" : "d"}:${sameTextKey(cue.text)}`;
    const same = open.get(key);
    if (same && cue.start < same.end) {
      same.cues.push(cue);
      same.end = Math.max(same.end, cue.end);
      continue;
    }
    const item: StackItem = { cues: [cue], lead: cue, start: cue.start, end: cue.end, screen, offset: 0, height: heightOf(cue) };
    items.push(item);
    open.set(key, item);
  }

  const dialogue = items.filter((i) => !i.screen);
  const screen = items.filter((i) => i.screen);

  // Earlier lines above later ones. Bottom row: a line sits on top of every later line it shares
  // the screen with (worked from the last line back). Top row: below every earlier one.
  const place = (list: StackItem[], floor: (item: StackItem) => number) => {
    const order = fromTop ? list : [...list].reverse();
    order.forEach((item, i) => {
      let offset = floor(item);
      for (const other of order.slice(0, i)) {
        if (overlaps(item, other)) offset = Math.max(offset, other.offset + other.height);
      }
      item.offset = offset;
    });
  };
  place(dialogue, () => 0);
  // On-screen text clears all the dialogue it shows with, whichever came first, by `gap`
  place(screen, (item) => {
    let top = 0;
    for (const d of dialogue) if (overlaps(item, d)) top = Math.max(top, d.offset + d.height + gap);
    return top;
  });
  return items;
}

/** Rows a cue's place on screen belongs to: 0 bottom, 1 middle, 2 top */
export const rowOfAlign = (align: CueAlign) => Math.floor((align - 1) / 3);
