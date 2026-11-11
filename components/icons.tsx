import { ArrowLeft, ArrowRight, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Star, Undo2 } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * The one icon set of the app is Lucide; no text symbols (▶ ★ ⟵ …) stand in for icons, since
 * those change shape between systems and some turn into emoji. The control panel, which is plain
 * HTML, copies the same Lucide paths (scripts/panel/page.html).
 */

/** Stroke of every icon: Lucide's own default */
export const ICON_STROKE = 2;

/**
 * The deliberate exception: a bolder stroke where an icon stands for emphasis. The selected
 * entry of the TV sidebar and of the web navigation, and key glyphs on a keycap, which sit next
 * to the keycap's black-weight "OK".
 */
export const ICON_STROKE_BOLD = 2.5;

const KEY_ICONS = {
  left: ChevronLeft,
  right: ChevronRight,
  up: ChevronUp,
  down: ChevronDown,
  back: Undo2,
} as const;

const KEY_NAMES: Record<RemoteKey, string> = {
  left: "izquierda",
  right: "derecha",
  up: "arriba",
  down: "abajo",
  back: "atrás",
};

export type RemoteKey = keyof typeof KEY_ICONS;

/**
 * Remote keys for a key hint, drawn at the text's size: `<RemoteKeys keys={["left", "right"]} />`.
 * An inline-block keeps a line of text's height, so a keycap with icons matches one saying "OK".
 */
export function RemoteKeys({ keys, className }: { keys: RemoteKey[]; className?: string }) {
  return (
    <span
      role="img"
      aria-label={keys.map((key) => KEY_NAMES[key]).join(", ")}
      className={cn("inline-block whitespace-nowrap", className)}
    >
      {keys.map((key) => {
        const Icon = KEY_ICONS[key];
        return (
          <Icon
            key={key}
            aria-hidden
            className="inline-block w-[1em] h-[1em] align-[-0.15em] ml-[0.15em] first:ml-0"
            strokeWidth={ICON_STROKE_BOLD}
          />
        );
      })}
    </span>
  );
}

/** A keyboard arrow key, for the hints shown to mouse users */
export function ArrowKey({ direction, className }: { direction: "left" | "right"; className?: string }) {
  const Icon = direction === "left" ? ArrowLeft : ArrowRight;
  return (
    <Icon
      role="img"
      aria-label={direction === "left" ? "Flecha izquierda" : "Flecha derecha"}
      className={cn("w-[1em] h-[1em]", className)}
      strokeWidth={ICON_STROKE_BOLD}
    />
  );
}

/** The filled star of a score, sized and aligned to the text around it */
export function ScoreStarIcon({ className }: { className?: string }) {
  return <Star aria-hidden className={cn("inline-block w-[0.9em] h-[0.9em] align-[-0.1em] fill-current", className)} />;
}
