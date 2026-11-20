"use client";

import { useEffect } from "react";

/**
 * Phones and tablets open episodes in full screen. Browsers only grant full screen from a tap, so
 * it's asked for on the tap that opens the episode (a link to /watch/…), and failing that (a
 * reload, a link from another app, a button that waits for the network first) on the first tap
 * on the player. The whole page goes full screen, as the player's own button does, so it lasts
 * through the move to the next episode.
 *
 * iPhones have no full screen for pages, only the system video player, which would drop ours,
 * and they're left as they are.
 */

const isFullscreen = () => Boolean(document.fullscreenElement || (document as any).webkitFullscreenElement);

// Set when the viewer leaves full screen during an episode: the next player doesn't put it back
// on their first tap. Opening an episode from the library clears it
let declined = false;

export function declineAutoFullscreen() {
  declined = true;
}

/** A touch screen that can put the page in full screen, outside another site's frame */
export function canAutoFullscreen() {
  if (typeof window === "undefined") return false;
  try {
    if (window.top !== window) return false;
  } catch {
    return false;
  }
  const supported = document.fullscreenEnabled || (document as any).webkitFullscreenEnabled;
  return Boolean(supported) && window.matchMedia("(pointer: coarse)").matches;
}

/** Puts the page in full screen, turned sideways where the device allows it */
export async function enterPageFullscreen() {
  if (isFullscreen()) return true;
  const el = document.documentElement as any;
  const request = el.requestFullscreen || el.webkitRequestFullscreen;
  if (!request) return false;
  try {
    await request.call(el);
  } catch {
    return false;
  }
  try {
    await (screen.orientation as any)?.lock?.("landscape");
  } catch {}
  return isFullscreen();
}

const watchLink = (target: EventTarget | null) => {
  const link = target instanceof Element ? target.closest("a[href]") : null;
  if (!(link instanceof HTMLAnchorElement) || (link.target && link.target !== "_self")) return false;
  const url = new URL(link.href, location.href);
  return url.origin === location.origin && url.pathname.startsWith("/watch/");
};

/** Taps on links to an episode put the page in full screen as they open it */
export function useFullscreenFromWatchLinks(pathname: string) {
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      if (!watchLink(e.target) || !canAutoFullscreen()) return;
      declined = false;
      enterPageFullscreen();
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, []);

  // An episode left before its player came up leaves full screen too (the player handles the rest)
  const watching = pathname.startsWith("/watch/");
  useEffect(() => {
    if (watching || document.fullscreenElement !== document.documentElement) return;
    document.exitFullscreen?.().catch(() => {});
  }, [watching]);
}

/**
 * For a player opened without a tap on an episode link: full screen right away if the tap that
 * led here still counts, otherwise on the first tap on the picture (its buttons do their own
 * thing; the full screen one would undo it). Returns the cleanup.
 */
export function armAutoFullscreen(container: HTMLElement, isControl: (target: HTMLElement) => boolean) {
  if (declined || isFullscreen() || !canAutoFullscreen()) return () => {};
  const onTap = (e: TouchEvent) => {
    if (e.target instanceof HTMLElement && isControl(e.target)) return;
    disarm();
    if (!declined) enterPageFullscreen();
  };
  const disarm = () => {
    container.removeEventListener("touchend", onTap, true);
    document.removeEventListener("fullscreenchange", disarm);
    document.removeEventListener("webkitfullscreenchange", disarm);
  };
  container.addEventListener("touchend", onTap, true);
  document.addEventListener("fullscreenchange", disarm);
  document.addEventListener("webkitfullscreenchange", disarm);
  // Entering full screen disarms the tap
  if ((navigator as any).userActivation?.isActive) enterPageFullscreen();
  return disarm;
}
