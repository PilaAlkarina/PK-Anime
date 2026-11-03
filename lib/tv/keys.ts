/**
 * Remote-control keys. TV browsers report the same button with different key/keyCode values,
 * so every check looks at both.
 */

// Tizen sends 10009 for Back, webOS 461; desktops and most Android TVs send Escape or Backspace
const BACK_KEYS = new Set(["Escape", "Backspace", "GoBack", "BrowserBack", "XF86Back"]);
const BACK_CODES = new Set([8, 27, 166, 461, 10009]);

export type MediaAction = "toggle" | "play" | "pause" | "stop" | "forward" | "rewind";

const MEDIA_KEYS: Record<string, MediaAction> = {
  MediaPlayPause: "toggle",
  MediaPlay: "play",
  MediaPause: "pause",
  MediaStop: "stop",
  MediaFastForward: "forward",
  MediaRewind: "rewind",
};

const MEDIA_CODES: Record<number, MediaAction> = {
  179: "toggle",
  10252: "toggle",
  415: "play",
  19: "pause",
  413: "stop",
  417: "forward",
  412: "rewind",
};

export function isTextInput(target: EventTarget | null) {
  const el = target as HTMLElement | null;
  return !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable);
}

export function isBackKey(e: KeyboardEvent) {
  // Backspace inside a text field deletes a character, it doesn't go back
  if ((e.key === "Backspace" || e.keyCode === 8) && isTextInput(e.target)) return false;
  return BACK_KEYS.has(e.key) || BACK_CODES.has(e.keyCode);
}

export function getMediaAction(e: KeyboardEvent): MediaAction | null {
  return MEDIA_KEYS[e.key] || MEDIA_CODES[e.keyCode] || null;
}
