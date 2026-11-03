import type React from "react";
import type { SubtitleStyles } from "../subtitle-settings-dialog";

/** Subtitle typography shared by the player overlay and the library settings preview */

export const DEFAULT_SUBTITLE_STYLES: SubtitleStyles = {
  fontSize: "base",
  fontFamily: "sans",
  fontWeight: "bold",
  color: "#ffffff",
  background: "transparent",
  shadow: true,
  outline: "thick",
};

export function subtitleFontFamily(font?: SubtitleStyles["fontFamily"]): string {
  switch (font) {
    case "anime":
      return '"Trebuchet MS", "Segoe UI", sans-serif';
    case "mono":
      return 'ui-monospace, "Cascadia Code", monospace';
    case "serif":
      return 'Georgia, Cambria, "Times New Roman", serif';
    default:
      return 'ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
  }
}

export function subtitleOutlineStyles(styles: SubtitleStyles): React.CSSProperties {
  const outline = styles.outline || "thick";
  if (outline === "thick") {
    return {
      WebkitTextStroke: "2px #000000",
      paintOrder: "stroke fill",
      textShadow:
        "0 0 2px #000000, 0 -2px 0 #000000, 0 2px 0 #000000, -2px 0 0 #000000, 2px 0 0 #000000, -1.5px -1.5px 0 #000000, 1.5px -1.5px 0 #000000, -1.5px 1.5px 0 #000000, 1.5px 1.5px 0 #000000, 0 2px 4px rgba(0, 0, 0, 0.9)",
    };
  }
  if (outline === "thin") {
    return {
      WebkitTextStroke: "1px #000000",
      paintOrder: "stroke fill",
      textShadow:
        "0 0 1px #000000, 0 -1px 0 #000000, 0 1px 0 #000000, -1px 0 0 #000000, 1px 0 0 #000000, -1px -1px 0 #000000, 1px -1px 0 #000000, -1px 1px 0 #000000, 1px 1px 0 #000000, 0 1px 3px rgba(0, 0, 0, 0.8)",
    };
  }
  return {
    WebkitTextStroke: "0px transparent",
    paintOrder: "normal",
    textShadow: styles.shadow ? "0 2px 4px rgba(0,0,0,0.9)" : "none",
  };
}
