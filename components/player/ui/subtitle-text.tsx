import type React from "react";
import { cn } from "@/lib/utils";
import type { SubtitleStyles } from "../subtitle-settings-dialog";
import { subtitleFontFamily, subtitleOutlineStyles } from "../player-core/subtitle-style";

// Share of the player's height per size, with a floor for small players
const SIZE: Record<SubtitleStyles["fontSize"], { k: number; min: number; preview: number }> = {
  sm: { k: 0.028, min: 14, preview: 13 },
  base: { k: 0.034, min: 17, preview: 15 },
  lg: { k: 0.042, min: 20, preview: 17 },
  xl: { k: 0.05, min: 24, preview: 19 },
  "2xl": { k: 0.058, min: 28, preview: 21 },
};

const isBlur = (bg: string) => bg.includes("0.4") || bg === "blur";

/** Font size in px for the chosen size: a share of the player's height, with a floor */
export function subtitleFontPx(styles: SubtitleStyles, playerHeight?: number, scale = 1) {
  const size = SIZE[styles.fontSize] || SIZE.base;
  return Math.round((playerHeight ? Math.max(size.min, playerHeight * size.k) : size.preview) * scale);
}

/** Line height of subtitle text (leading-snug) and its box's vertical padding, both in em */
export const SUBTITLE_LINE_EM = 1.375;
export const SUBTITLE_PAD_Y_EM = 0.1;
export const SUBTITLE_PAD_X_EM = 0.4;

export function SubtitleText({
  styles,
  children,
  playerHeight,
  scale = 1,
  color,
  className,
}: {
  styles: SubtitleStyles;
  children: React.ReactNode;
  /** Scales the text with the player; omitted for the small preview in Ajustes */
  playerHeight?: number;
  /** Size relative to the chosen one (signs grouped small) */
  scale?: number;
  /** Text color instead of the chosen one (on-screen text, a shade darker) */
  color?: string;
  className?: string;
}) {
  const fontSize = subtitleFontPx(styles, playerHeight, scale);
  const background = isBlur(styles.background)
    ? undefined
    : styles.background === "solid"
      ? "rgba(0, 0, 0, 0.85)"
      : styles.background;

  return (
    <span
      className={cn(
        "inline-block px-[0.4em] py-[0.1em] rounded-md whitespace-pre-line leading-snug",
        isBlur(styles.background) && "backdrop-blur-md bg-black/40",
        className
      )}
      style={{
        fontSize,
        fontFamily: subtitleFontFamily(styles.fontFamily),
        fontWeight: styles.fontWeight === "normal" ? 400 : 700,
        color: color ?? styles.color,
        backgroundColor: background,
        ...subtitleOutlineStyles(styles),
      }}
    >
      {children}
    </span>
  );
}
