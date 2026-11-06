"use client";

import { useRef, useState } from "react";
import { cn, formatSecondsToTime } from "@/lib/utils";
import type { SkipRange } from "./types";

interface TimelineProps {
  currentTime: number;
  duration: number;
  buffered: number;
  intro: SkipRange | null;
  outro: SkipRange | null;
  onSeek: (seconds: number) => void;
  onActivity?: () => void;
  /** Bigger track and knob for the TV layout */
  tv?: boolean;
  /** "Intro" / "Ending" under their segments */
  showLabels?: boolean;
  /** Knob always visible (paused, TV); otherwise it grows on hover */
  showKnob?: boolean;
  /** Paused: a slightly thinner track and a smaller knob */
  thin?: boolean;
  /** What the slider moves through, for screen readers */
  label?: string;
}

const pct = (value: number, duration: number) => `${Math.min(100, Math.max(0, (value / duration) * 100))}%`;
const ratio = (value: number, start: number, end: number) =>
  end > start ? Math.min(1, Math.max(0, (value - start) / (end - start))) : 0;

interface Piece {
  start: number;
  end: number;
  /** Intro / ending pieces sit on the second accent */
  label: string | null;
}

/** Splits the track into pieces at the intro and ending edges (each piece is drawn on its own) */
function piecesOf(duration: number, ranges: { range: SkipRange; label: string }[]): Piece[] {
  const pieces: Piece[] = [];
  let at = 0;
  const sorted = ranges
    .map(({ range, label }) => ({
      start: Math.max(0, Math.min(duration, range.start)),
      end: Math.max(0, Math.min(duration, range.end)),
      label,
    }))
    .filter((r) => r.end > r.start)
    .sort((a, b) => a.start - b.start);
  for (const r of sorted) {
    const start = Math.max(at, r.start);
    if (r.end <= start) continue;
    if (start > at) pieces.push({ start: at, end: start, label: null });
    pieces.push({ start, end: r.end, label: r.label });
    at = r.end;
  }
  if (duration > at) pieces.push({ start: at, end: duration, label: null });
  return pieces;
}

/**
 * Seek bar: played time in red over the buffered range, split into pieces at the intro and
 * ending (marked in the second accent). Dragging moves only the knob; the video seeks once on release.
 */
export function Timeline({
  currentTime,
  duration,
  buffered,
  intro,
  outro,
  onSeek,
  onActivity,
  tv = false,
  showLabels = false,
  showKnob = false,
  thin = false,
  label = "Progreso del episodio",
}: TimelineProps) {
  const trackRef = useRef<HTMLDivElement | null>(null);
  const [hover, setHover] = useState<number | null>(null);
  const [drag, setDrag] = useState<number | null>(null);

  const timeAt = (clientX: number) => {
    const rect = trackRef.current?.getBoundingClientRect();
    if (!rect || !duration) return 0;
    return Math.min(1, Math.max(0, (clientX - rect.left) / rect.width)) * duration;
  };

  const shown = drag ?? currentTime;
  const tip = drag ?? hover;
  const tipSegment =
    tip === null
      ? null
      : intro && tip >= intro.start && tip <= intro.end
        ? "Intro"
        : outro && tip >= outro.start && tip <= outro.end
          ? "Ending"
          : null;

  const segments = [
    intro && { range: intro, label: "Intro" },
    outro && { range: outro, label: "Ending" },
  ].filter(Boolean) as { range: SkipRange; label: string }[];
  const pieces = duration > 0 ? piecesOf(duration, segments) : [];

  return (
    <div className="relative">
      <div
        ref={trackRef}
        role="slider"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={Math.round(duration)}
        aria-valuenow={Math.round(shown)}
        aria-valuetext={`${formatSecondsToTime(shown)} de ${formatSecondsToTime(duration)}`}
        onPointerDown={(e) => {
          if (!duration) return;
          e.currentTarget.setPointerCapture(e.pointerId);
          setDrag(timeAt(e.clientX));
          onActivity?.();
        }}
        onPointerMove={(e) => {
          if (!duration) return;
          const t = timeAt(e.clientX);
          if (drag !== null) {
            setDrag(t);
            onActivity?.();
          } else if (e.pointerType === "mouse") {
            setHover(t);
          }
        }}
        onPointerUp={(e) => {
          if (drag === null) return;
          onSeek(timeAt(e.clientX));
          setDrag(null);
        }}
        onPointerCancel={() => setDrag(null)}
        onPointerLeave={() => setHover(null)}
        className={cn(
          "group/timeline relative flex items-center cursor-pointer touch-none select-none",
          tv ? "h-8 [--seg-gap:5px]" : "h-6 [--seg-gap:3px] touch:[--seg-gap:2px]"
        )}
      >
        <div
          className={cn(
            "relative w-full transition-[height] duration-150",
            tv
              ? thin
                ? "h-2"
                : "h-2.5"
              : cn(thin ? "h-[5px]" : "h-1.5 mouse:group-hover/timeline:h-2", "touch:h-1", drag !== null && !thin && "mouse:h-2")
          )}
        >
          {duration > 0 &&
            pieces.map((piece, i) => {
              // Gaps are carved out of the edges, so time still maps linearly onto the width
              const left = i > 0 ? `calc(${pct(piece.start, duration)} + var(--seg-gap) / 2)` : pct(piece.start, duration);
              const right =
                i < pieces.length - 1
                  ? `calc(${pct(duration - piece.end, duration)} + var(--seg-gap) / 2)`
                  : pct(duration - piece.end, duration);
              return (
                <div
                  key={`${piece.start}-${piece.end}`}
                  className={cn("absolute inset-y-0 rounded-full overflow-hidden", piece.label ? "bg-amber-500/60" : "bg-white/[0.18]")}
                  style={{ left, right }}
                >
                  {!piece.label && (
                    <div
                      className="absolute inset-y-0 left-0 bg-white/[0.32]"
                      style={{ width: `${ratio(buffered, piece.start, piece.end) * 100}%` }}
                    />
                  )}
                  <div
                    className="absolute inset-y-0 left-0 bg-red-500"
                    style={{ width: `${ratio(shown, piece.start, piece.end) * 100}%` }}
                  />
                </div>
              );
            })}
        </div>

        {duration > 0 && (
          <div
            className={cn(
              "absolute top-1/2 rounded-full bg-white pointer-events-none -translate-x-1/2 -translate-y-1/2 transition-transform duration-150",
              tv
                ? "w-[26px] h-[26px] shadow-[0_0_0_5px_rgba(var(--c-accent),0.4)]"
                : cn(
                    "shadow-[0_0_0_4px_rgba(var(--c-accent),0.4)]",
                    thin ? "w-3.5 h-3.5" : "w-[18px] h-[18px] touch:w-3.5 touch:h-3.5"
                  ),
              showKnob || drag !== null ? "scale-100" : "scale-0 group-hover/timeline:scale-100 touch:scale-100"
            )}
            style={{ left: pct(shown, duration) }}
          />
        )}

        {tip !== null && duration > 0 && !tv && (
          <div
            className="absolute bottom-full mb-2 px-2.5 py-1 rounded-md bg-white text-black text-[13px] font-bold tabular-nums whitespace-nowrap pointer-events-none -translate-x-1/2"
            style={{ left: `clamp(2.5rem, ${pct(tip, duration)}, calc(100% - 2.5rem))` }}
          >
            {tipSegment && <span className="mr-1.5 text-red-600">{tipSegment}</span>}
            {formatSecondsToTime(tip)}
          </div>
        )}
      </div>

      {showLabels && duration > 0 && segments.length > 0 && (
        <div className="relative h-4 mt-1 text-[11px] font-bold tracking-[0.06em] text-amber-500 pointer-events-none touch:hidden">
          {segments.map(({ range, label }) => (
            <span key={label} className="absolute top-0" style={{ left: pct(range.start, duration) }}>
              {label}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
