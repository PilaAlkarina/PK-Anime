"use client";

import { useState } from "react";
import { useIsTv } from "@/components/ui-mode";
import { useTvFocusable } from "./focusable";
import { cn } from "@/lib/utils";

/*
 * A score button for the finish screen, with a manga trope per score (styles in
 * app/(library)/score-chips.css). Every chip looks the same at rest; the focused or hovered one
 * lifts and plays its trope: 1 a raincloud, 2 an anger vein, 3 "…", 4 Zzz, 5 nothing, 6 blushing
 * cheeks, 7 shōjo flowers, 8 speed lines and ドン, 9 gold with a golden aura, 10 iridescent with a
 * halo and falling sakura.
 */

function Flower({ cls, petals, center }: { cls: string; petals: string; center: string }) {
  return (
    <svg className={`pk-sc-deco pk-sc-flower ${cls}`} viewBox="0 0 20 20" aria-hidden>
      {[0, 72, 144, 216, 288].map((a) => {
        const r = (a * Math.PI) / 180;
        return (
          <circle
            key={a}
            cx={(10 + Math.cos(r) * 5.5).toFixed(1)}
            cy={(10 + Math.sin(r) * 5.5).toFixed(1)}
            r="4.2"
            fill={petals}
            stroke="#0C0B10"
            strokeWidth="0.8"
          />
        );
      })}
      <circle cx="10" cy="10" r="3" fill={center} />
    </svg>
  );
}

function Flame({ cls, outer, inner }: { cls: string; outer: string; inner: string }) {
  return (
    <svg className={`pk-sc-deco pk-sc-flame ${cls}`} viewBox="0 0 20 32" aria-hidden>
      <path
        d="M10 31 C 1 27, 1 18, 6 11 C 7 16, 9 16, 9 12 C 9 7, 12 3, 14 0 C 14 7, 19 12, 19 20 C 19 27, 15 31, 10 31 Z"
        fill={outer}
        stroke="#0C0B10"
        strokeWidth="1"
      />
      <path d="M10 30 C 6 28, 6 23, 9 19 C 10 22, 12 22, 12 19 C 15 22, 15 28, 10 30 Z" fill={inner} />
    </svg>
  );
}

function Petal({ cls }: { cls: string }) {
  return (
    <svg className={`pk-sc-deco pk-sc-petal ${cls}`} viewBox="0 0 12 16" aria-hidden>
      <path d="M6 0 C 9 2, 12 7, 6 16 C 0 7, 3 2, 6 0 Z M6 0 L6 4" fill="#fbcfe8" stroke="#f472b6" strokeWidth="0.8" />
    </svg>
  );
}

function Trope({ score }: { score: number }) {
  switch (score) {
    case 1:
      return (
        <>
          <svg className="pk-sc-deco pk-sc-cloud" viewBox="0 0 44 20" aria-hidden>
            <ellipse cx="13" cy="12" rx="10" ry="7" fill="#4b5563" stroke="#0C0B10" />
            <ellipse cx="24" cy="8" rx="11" ry="8" fill="#6b7280" stroke="#0C0B10" />
            <ellipse cx="33" cy="13" rx="9" ry="6" fill="#4b5563" stroke="#0C0B10" />
          </svg>
          <span className="pk-sc-deco pk-sc-rain" aria-hidden>
            <i />
            <i />
            <i />
          </span>
        </>
      );
    case 2:
      return (
        <svg className="pk-sc-deco pk-sc-vein" viewBox="0 0 22 22" aria-hidden>
          <path
            d="M3 9 Q 9 9 9 3 M 13 3 Q 13 9 19 9 M 19 13 Q 13 13 13 19 M 9 19 Q 9 13 3 13"
            fill="none"
            stroke="#dc2626"
            strokeWidth="2.8"
            strokeLinecap="round"
          />
        </svg>
      );
    case 3:
      return (
        <span className="pk-sc-deco pk-sc-dots" aria-hidden>
          <i />
          <i />
          <i />
        </span>
      );
    case 4:
      return (
        <>
          <span className="pk-sc-deco pk-sc-z a" aria-hidden>
            z
          </span>
          <span className="pk-sc-deco pk-sc-z b" aria-hidden>
            z
          </span>
          <span className="pk-sc-deco pk-sc-z c" aria-hidden>
            Z
          </span>
        </>
      );
    case 6:
      return (
        <>
          <span className="pk-sc-deco pk-sc-blush l" aria-hidden />
          <span className="pk-sc-deco pk-sc-blush r" aria-hidden />
        </>
      );
    case 7:
      return (
        <>
          <Flower cls="a" petals="#fbcfe8" center="#facc15" />
          <Flower cls="b" petals="#fde68a" center="#fb923c" />
          <Flower cls="c" petals="#bfdbfe" center="#facc15" />
          <Flower cls="d" petals="#fbcfe8" center="#facc15" />
        </>
      );
    case 8:
      return (
        <>
          <svg className="pk-sc-deco pk-sc-speed" viewBox="0 0 44 36" aria-hidden>
            <path
              d="M4 6 L40 6 M14 13 L42 13 M0 20 L38 20 M10 27 L42 27 M18 33 L40 33"
              stroke="#F4F1EA"
              strokeWidth="1.6"
              strokeLinecap="round"
            />
          </svg>
          <span className="pk-sc-deco pk-sc-don" aria-hidden>
            ドン
          </span>
        </>
      );
    case 9:
      return (
        <>
          <Flame cls="a" outer="#fbbf24" inner="#fef3c7" />
          <Flame cls="b" outer="#f59e0b" inner="#fde68a" />
          <Flame cls="c" outer="#fbbf24" inner="#fef3c7" />
        </>
      );
    case 10:
      return (
        <>
          <span className="pk-sc-inside" aria-hidden />
          <svg className="pk-sc-deco pk-sc-halo" viewBox="0 0 40 12" aria-hidden>
            <ellipse cx="20" cy="6" rx="17" ry="4.5" fill="none" stroke="#fde68a" strokeWidth="2.6" />
            <ellipse cx="20" cy="6" rx="17" ry="4.5" fill="none" stroke="#fff" strokeWidth="0.8" opacity="0.8" />
          </svg>
          <Petal cls="a" />
          <Petal cls="b" />
          <Petal cls="c" />
        </>
      );
    default:
      return null;
  }
}

interface ScoreChipProps {
  score: number;
  focusKey?: string;
  onSelect: () => void;
  className?: string;
}

export function ScoreChip(props: ScoreChipProps) {
  return useIsTv() ? <TvScoreChip {...props} /> : <WebScoreChip {...props} />;
}

function TvScoreChip({ score, focusKey, onSelect, className }: ScoreChipProps) {
  const { ref, focused, pointerProps } = useTvFocusable({ focusKey, onSelect });
  return (
    <button
      ref={ref}
      type="button"
      {...pointerProps}
      aria-label={`Nota ${score}`}
      className={cn("pk-sc", `pk-sc-${score}`, focused && "is-on", className)}
    >
      <Trope score={score} />
      <b>{score}</b>
    </button>
  );
}

/** Keyboard focus lights the chip up; a click's focus doesn't (hover already did) */
function focusVisible(node: HTMLElement) {
  try {
    return node.matches(":focus-visible");
  } catch {
    return true;
  }
}

function WebScoreChip({ score, onSelect, className }: ScoreChipProps) {
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  return (
    <button
      type="button"
      onClick={onSelect}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocus={(e) => setFocused(focusVisible(e.currentTarget))}
      onBlur={() => setFocused(false)}
      aria-label={`Nota ${score}`}
      className={cn("pk-sc", `pk-sc-${score}`, (hovered || focused) && "is-on", className)}
    >
      <Trope score={score} />
      <b>{score}</b>
    </button>
  );
}
