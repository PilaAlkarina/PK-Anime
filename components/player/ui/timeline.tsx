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
}

const pct = (value: number, duration: number) => `${Math.min(100, Math.max(0, (value / duration) * 100))}%`;

/**
 * Seek bar: played time in red over the buffered range, with intro and ending marked in amber.
 * Dragging moves only the knob; the video seeks once on release.
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

  return (
    <div className="relative">
      <div
        ref={trackRef}
        role="slider"
        aria-label="Progreso del episodio"
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
          tv ? "h-8" : "h-6"
        )}
      >
        <div
          className={cn(
            "relative w-full rounded-full bg-white/20 overflow-hidden transition-[height] duration-150",
            tv ? "h-2.5" : "h-1.5 group-hover/timeline:h-2",
            drag !== null && !tv && "h-2"
          )}
        >
          {duration > 0 && (
            <>
              <div className="absolute inset-y-0 left-0 bg-white/30" style={{ width: pct(buffered, duration) }} />
              {segments.map(({ range, label }) => (
                <div
                  key={label}
                  className="absolute inset-y-0 bg-amber-400/60"
                  style={{ left: pct(range.start, duration), width: pct(range.end - range.start, duration) }}
                />
              ))}
              <div className="absolute inset-y-0 left-0 bg-red-500" style={{ width: pct(shown, duration) }} />
            </>
          )}
        </div>

        {duration > 0 && (
          <div
            className={cn(
              "absolute top-1/2 rounded-full bg-white pointer-events-none -translate-x-1/2 -translate-y-1/2 transition-transform duration-150 shadow-[0_0_0_4px_rgba(239,68,68,0.35)]",
              tv ? "w-6 h-6" : "w-4 h-4",
              showKnob || drag !== null ? "scale-100" : "scale-0 group-hover/timeline:scale-100 touch:scale-100"
            )}
            style={{ left: pct(shown, duration) }}
          />
        )}

        {tip !== null && duration > 0 && !tv && (
          <div
            className="absolute bottom-full mb-2 px-2.5 py-1 rounded-lg bg-zinc-950/90 text-[13px] font-semibold tabular-nums whitespace-nowrap pointer-events-none -translate-x-1/2"
            style={{ left: `clamp(2.5rem, ${pct(tip, duration)}, calc(100% - 2.5rem))` }}
          >
            {tipSegment && <span className="mr-1.5 text-amber-300">{tipSegment}</span>}
            {formatSecondsToTime(tip)}
          </div>
        )}
      </div>

      {showLabels && duration > 0 && segments.length > 0 && (
        <div className="relative h-4 text-[11px] font-medium text-amber-300/90 pointer-events-none">
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
