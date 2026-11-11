"use client";

import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import type React from "react";
import { cn } from "@/lib/utils";
import type { SubtitleStyles } from "../subtitle-settings-dialog";
import type { CueAlign, CueSpan, SubtitleCue } from "../player-core/subtitle-cues";
import { subtitleFontFamily, subtitleOutlineStyles } from "../player-core/subtitle-style";
import { stackRegion, type StackItem } from "../player-core/subtitle-stack";
import { SUBTITLE_LINE_EM, SUBTITLE_PAD_X_EM, SUBTITLE_PAD_Y_EM, SubtitleText, subtitleFontPx } from "./subtitle-text";

/** Signs grouped small: their size next to the chosen one */
const SIGN_SCALE = 0.62;
/** A sign without a size in the file: a share of the picture's height */
const DEFAULT_SIGN_SIZE = 0.045;

/** On-screen text next to the dialogue: the chosen color this much darker */
const SCREEN_SHADE = 0.72;
/** Room left between the dialogue and on-screen text above it, in em */
const SCREEN_GAP_EM = 0.5;
/** Widest a line of dialogue gets, as a share of the row */
const MAX_LINE_WIDTH = 0.85;

let measureCtx: CanvasRenderingContext2D | null | undefined;

const cellRatios = new Map<string, number>();

/**
 * CSS font size for each pixel of an ASS size in this font. ASS sizes (as libass and VSFilter
 * draw them) are the height of a whole line, top of the ascenders to bottom of the descenders,
 * while a CSS size is the font's em, smaller by an amount that changes from font to font (Comic
 * Sans' line is 1.39 em tall, Arial's 1.15): measured once per font.
 */
function emPerCell(family: string) {
  const known = cellRatios.get(family);
  if (known) return known;
  if (measureCtx === undefined) measureCtx = document.createElement("canvas").getContext("2d");
  let ratio = 0.85;
  if (measureCtx) {
    measureCtx.font = `100px ${family}`;
    const m = measureCtx.measureText("Hg");
    // fontBoundingBox* are the font's own ascent and descent (Chromium 87+); older engines keep 0.85
    const height = (m.fontBoundingBoxAscent ?? 0) + (m.fontBoundingBoxDescent ?? 0);
    if (height > 50) ratio = 100 / height;
  }
  cellRatios.set(family, ratio);
  return ratio;
}

/** The file's font first when it names one (used if this device has it), then the viewer's */
const familyFor = (font: string | undefined, fallback: string) => (font ? `"${font.replace(/["\\]/g, "")}", ${fallback}` : fallback);

/**
 * A placed ASS sign's text at the file's sizes: each line as tall as its biggest piece (an ASS
 * line), each piece at its own size, font, weight and slant.
 */
function PlacedText({ cue, height, fallbackFamily, col }: { cue: SubtitleCue; height: number; fallbackFamily: string; col: number }) {
  const lines: CueSpan[][] = [[]];
  for (const span of cue.spans) {
    span.text.split("\n").forEach((part, i) => {
      if (i > 0) lines.push([]);
      if (part) lines[lines.length - 1].push({ ...span, text: part });
    });
  }
  const cellOf = (span?: CueSpan) => Math.max(1, (span?.size ?? cue.size ?? DEFAULT_SIGN_SIZE) * height);
  return (
    <>
      {lines.map((line, i) => {
        const cell = Math.max(...(line.length ? line.map(cellOf) : [cellOf(cue.spans[0])]));
        // A flex row: as tall as its tallest piece, with no strut in the page's own font making
        // it taller (which a block line would add when the fonts' baselines differ)
        return (
          <span
            key={i}
            className="flex items-baseline"
            style={{ height: cell, justifyContent: col === 0 ? "flex-start" : col === 2 ? "flex-end" : "center" }}
          >
            {line.map((span, j) => {
              const family = familyFor(span.font, fallbackFamily);
              return (
                <span
                  key={j}
                  style={{
                    lineHeight: `${cellOf(span)}px`,
                    fontSize: cellOf(span) * emPerCell(family),
                    fontFamily: family,
                    fontWeight: span.bold ? 700 : 400,
                    fontStyle: span.italic ? "italic" : undefined,
                  }}
                >
                  {span.text}
                </span>
              );
            })}
          </span>
        );
      })}
    </>
  );
}

/** Lines a text takes once wrapped at `maxWidth`, measured in the font it's drawn with */
function wrappedLines(text: string, font: string, maxWidth: number) {
  if (measureCtx === undefined) measureCtx = document.createElement("canvas").getContext("2d");
  const ctx = measureCtx;
  if (!ctx || maxWidth <= 0) return text.split("\n").length;
  ctx.font = font;
  let lines = 0;
  for (const line of text.split("\n")) {
    let width = 0;
    let count = 1;
    for (const word of line.split(/(\s+)/)) {
      const w = ctx.measureText(word).width;
      if (width + w > maxWidth && width > 0 && word.trim()) {
        count++;
        width = w;
      } else width += w;
    }
    lines += count;
  }
  return lines;
}

/** "#rrggbb" mixed towards black; other color formats stay as they are */
function shade(color: string, amount: number) {
  const m = color.match(/^#([0-9a-f]{6})$/i);
  if (!m) return color;
  const n = parseInt(m[1], 16);
  const ch = (shift: number) => Math.round(((n >> shift) & 255) * amount);
  return `rgb(${ch(16)}, ${ch(8)}, ${ch(0)})`;
}

const rowOf = (align: CueAlign) => Math.floor((align - 1) / 3); // 0 bottom, 1 middle, 2 top
const colOf = (align: CueAlign) => (align - 1) % 3; // 0 left, 1 center, 2 right

/** A cue's text with its italics and bold */
function CueLine({ cue }: { cue: SubtitleCue }) {
  return (
    <>
      {cue.spans.map((span, i) => {
        const node = span.italic ? <i>{span.text}</i> : span.text;
        return <Fragment key={i}>{span.bold ? <b className="font-[800]">{node}</b> : node}</Fragment>;
      })}
    </>
  );
}

/** The picture's box inside the player, where the video's own pixels are (object-contain) */
function useVideoBox(rootRef: React.RefObject<HTMLDivElement>, videoRef: React.RefObject<HTMLVideoElement>) {
  const [box, setBox] = useState({ x: 0, y: 0, w: 0, h: 0, rootW: 0 });
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const measure = () => {
      const w = root.clientWidth;
      const h = root.clientHeight;
      const video = videoRef.current;
      const aspect = video && video.videoWidth && video.videoHeight ? video.videoWidth / video.videoHeight : 16 / 9;
      const fitW = Math.min(w, h * aspect);
      const fitH = fitW / aspect;
      setBox({ x: (w - fitW) / 2, y: (h - fitH) / 2, w: fitW, h: fitH, rootW: w });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(root);
    const video = videoRef.current;
    video?.addEventListener("loadedmetadata", measure);
    return () => {
      ro.disconnect();
      video?.removeEventListener("loadedmetadata", measure);
    };
  }, [rootRef, videoRef]);
  return box;
}

/**
 * Everything the subtitle file shows at this moment:
 * - dialogue in its row and column (the numpad's nine places), lifted over the controls by the
 *   classes the player passes for the bottom and top rows;
 * - ASS signs with an exact spot (\pos) on that spot of the picture, at the file's size;
 * - bursts of signs a file couldn't place (`sign`), grouped small at the top instead of stacked.
 * Lines of dialogue in the bottom and top rows keep one height while they show (see
 * subtitle-stack.ts): laid out for the whole file, so a line joined by a later one appears
 * already raised instead of being pushed up when the other arrives.
 */
export function SubtitleLayer({
  cues,
  allCues,
  styles,
  playerHeight,
  videoRef,
  bottomClass,
  topClass,
}: {
  /** What shows now */
  cues: SubtitleCue[];
  /** The whole file, to lay out each line's height in advance */
  allCues: SubtitleCue[];
  styles: SubtitleStyles;
  playerHeight: number;
  videoRef: React.RefObject<HTMLVideoElement>;
  /** Where the bottom row sits (it rises while the controls show) */
  bottomClass: string;
  /** Where the top row sits (clear of the header while it shows) */
  topClass: string;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const box = useVideoBox(rootRef, videoRef);

  // Placed signs and drawings, lower layers first so higher ones paint over them
  const placed = cues
    .map((cue, i) => ({ cue, i }))
    .filter(({ cue }) => cue.pos)
    .sort((a, b) => (a.cue.layer ?? 0) - (b.cue.layer ?? 0) || a.i - b.i)
    .map(({ cue }) => cue);
  const signs = cues.filter((c) => !c.pos && c.sign);

  // Each line's height in the bottom and top rows, for the whole file, measured as it'll be drawn
  const fontPx = subtitleFontPx(styles, playerHeight);
  const fontFamily = subtitleFontFamily(styles.fontFamily);
  const weight = styles.fontWeight === "normal" ? 400 : 700;
  const rowWidth = Math.max(0, box.rootW - 32);
  const stacks = useMemo(() => {
    const byCue = new Map<SubtitleCue, StackItem>();
    if (!rowWidth) return byCue;
    // The left and right columns lose 3% to their padding
    const maxWidth = rowWidth * 0.97 * MAX_LINE_WIDTH - 2 * SUBTITLE_PAD_X_EM * fontPx;
    const heightOf = (cue: SubtitleCue) => {
      const font = `${cue.spans.some((s) => s.bold) ? 800 : weight} ${fontPx}px ${fontFamily}`;
      return (wrappedLines(cue.text, font, maxWidth) * SUBTITLE_LINE_EM + 2 * SUBTITLE_PAD_Y_EM) * fontPx;
    };
    const byAlign = new Map<CueAlign, SubtitleCue[]>();
    for (const cue of allCues) {
      if (cue.pos || cue.sign || rowOf(cue.align) === 1) continue;
      byAlign.set(cue.align, [...(byAlign.get(cue.align) ?? []), cue]);
    }
    for (const [align, list] of byAlign) {
      const items = stackRegion(list, heightOf, { gap: SCREEN_GAP_EM * fontPx, fromTop: rowOf(align) === 2 });
      for (const item of items) for (const cue of item.cues) byCue.set(cue, item);
    }
    return byCue;
  }, [allCues, rowWidth, fontPx, fontFamily, weight]);

  // Lines on show in the bottom and top rows, each once, at its height
  const stacked = new Map<CueAlign, StackItem[]>();
  const regions = new Map<CueAlign, SubtitleCue[]>();
  for (const cue of cues) {
    if (cue.pos || cue.sign) continue;
    const item = stacks.get(cue);
    if (item) {
      const list = stacked.get(cue.align) ?? [];
      if (!list.includes(item)) list.push(item);
      stacked.set(cue.align, list);
      continue;
    }
    const list = regions.get(cue.align) ?? [];
    // The same line twice at once (two layers of one subtitle) shows once
    if (!list.some((c) => c.text === cue.text)) list.push(cue);
    regions.set(cue.align, list);
  }

  // Small signs read better with a thinner outline than the dialogue's
  const signOutline = subtitleOutlineStyles({ ...styles, outline: styles.outline === "none" ? "none" : "thin" });

  return (
    <div ref={rootRef} className="absolute top-0 left-0 w-full h-full z-20 pointer-events-none">
      {placed.map((cue, i) => {
        const row = rowOf(cue.align);
        const col = colOf(cue.align);
        const anchorX = box.x + cue.pos!.x * box.w;
        const anchorY = box.y + cue.pos!.y * box.h;
        const blur = cue.blur ? `blur(${Math.max(0.5, cue.blur * box.h).toFixed(1)}px)` : undefined;

        // A drawing: the box behind a sign, a card, an arrow…
        if (cue.shape) {
          const width = cue.shape.width * box.w;
          const height = cue.shape.height * box.h;
          return (
            <svg
              key={`d${i}-${cue.start}`}
              aria-hidden
              className="absolute overflow-visible"
              viewBox={cue.shape.box.join(" ")}
              preserveAspectRatio="none"
              style={{
                left: anchorX - (col * width) / 2,
                top: anchorY - (row === 2 ? 0 : row === 1 ? height / 2 : height),
                width,
                height,
                filter: blur,
              }}
            >
              <path
                d={cue.shape.d}
                fill={cue.color ?? "#fff"}
                stroke={cue.outline?.color ?? "none"}
                strokeWidth={cue.outline ? cue.outline.width * box.h * 2 : 0}
                vectorEffect="non-scaling-stroke"
                strokeLinejoin="round"
              />
            </svg>
          );
        }

        const tx = ["0%", "-50%", "-100%"][col];
        const ty = ["-100%", "-50%", "0%"][row];
        const origin = `${["left", "center", "right"][col]} ${["bottom", "center", "top"][row]}`;
        // The file's own colors when it has them, so a sign reads on the box drawn behind it
        const look: React.CSSProperties = cue.color
          ? cue.outline
            ? {
                color: cue.color,
                WebkitTextStroke: `${Math.max(1, cue.outline.width * box.h * 2).toFixed(1)}px ${cue.outline.color}`,
                paintOrder: "stroke fill",
                textShadow: "none",
              }
            : { color: cue.color, WebkitTextStroke: "0px transparent", textShadow: "none" }
          : { color: styles.color, ...signOutline };
        return (
          <span
            key={`p${i}-${cue.start}-${cue.text}`}
            className={cn("absolute whitespace-pre", col === 0 ? "text-left" : col === 2 ? "text-right" : "text-center")}
            style={{
              left: anchorX,
              top: anchorY,
              transform: `translate(${tx}, ${ty})${cue.scaleX && cue.scaleX !== 1 ? ` scaleX(${cue.scaleX})` : ""}`,
              transformOrigin: origin,
              filter: blur,
              ...look,
            }}
          >
            {/* At the file's sizes, fonts and weights, like the boxes drawn behind them */}
            <PlacedText cue={cue} height={box.h} col={col} fallbackFamily={subtitleFontFamily(styles.fontFamily)} />
          </span>
        );
      })}

      {signs.length > 0 && (
        <div className={cn("absolute left-4 right-4 flex justify-center transition-[top] duration-300", topClass)}>
          <div className="flex flex-wrap justify-center max-w-[80%] text-center">
            {signs
              .filter((c, i, all) => all.findIndex((o) => o.text === c.text) === i)
              .map((cue, i) => (
                <SubtitleText key={`s${i}-${cue.text}`} styles={styles} playerHeight={playerHeight} scale={SIGN_SCALE} className="m-[0.12em]">
                  <CueLine cue={cue} />
                </SubtitleText>
              ))}
          </div>
        </div>
      )}

      {Array.from(stacked.entries()).map(([align, items]) => {
        const row = rowOf(align);
        const col = colOf(align);
        return (
          <div
            key={`stack-${align}`}
            className={cn(
              "absolute left-4 right-4 h-0 ease-[cubic-bezier(0.16,1,0.3,1)] duration-300",
              row === 0 ? cn("transition-[bottom]", bottomClass) : cn("transition-[top]", topClass)
            )}
          >
            {items.map((item) => (
              <div
                key={`${item.start}-${item.lead.text}`}
                className={cn(
                  "absolute inset-x-0 flex",
                  col === 0 ? "justify-start pl-[3%] text-left" : col === 2 ? "justify-end pr-[3%] text-right" : "justify-center text-center"
                )}
                style={row === 0 ? { bottom: item.offset } : { top: item.offset }}
              >
                <SubtitleText
                  styles={styles}
                  playerHeight={playerHeight}
                  color={item.screen ? shade(styles.color, SCREEN_SHADE) : undefined}
                  className="max-w-[85%]"
                >
                  <CueLine cue={item.lead} />
                </SubtitleText>
              </div>
            ))}
          </div>
        );
      })}

      {Array.from(regions.entries()).map(([align, list]) => {
        const row = rowOf(align);
        const col = colOf(align);
        // On-screen text on top, a shade darker, and the dialogue under it, a little apart
        const screen = list.filter((c) => c.screen);
        const talk = list.filter((c) => !c.screen);
        const lines = (cues: SubtitleCue[]) =>
          cues.map((cue, i) => (
            <Fragment key={`${i}-${cue.text}`}>
              {i > 0 && "\n"}
              <CueLine cue={cue} />
            </Fragment>
          ));
        return (
          <div
            key={align}
            className={cn(
              "absolute left-4 right-4 flex",
              row === 0 && cn("transition-[bottom] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]", bottomClass),
              row === 2 && cn("transition-[top] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]", topClass),
              row === 1 && "top-1/2 -translate-y-1/2",
              col === 0 ? "justify-start pl-[3%] text-left" : col === 2 ? "justify-end pr-[3%] text-right" : "justify-center text-center"
            )}
          >
            <div className={cn("flex flex-col max-w-[85%]", col === 0 ? "items-start" : col === 2 ? "items-end" : "items-center")}>
              {screen.length > 0 && (
                <SubtitleText styles={styles} playerHeight={playerHeight} color={shade(styles.color, SCREEN_SHADE)}>
                  {lines(screen)}
                </SubtitleText>
              )}
              {talk.length > 0 && (
                <SubtitleText styles={styles} playerHeight={playerHeight} className={screen.length > 0 ? "mt-[0.5em]" : undefined}>
                  {lines(talk)}
                </SubtitleText>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
