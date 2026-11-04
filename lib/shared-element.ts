"use client";

import { useEffect, useLayoutEffect, type RefObject } from "react";

/**
 * Shared-element transitions between library screens, without the View Transitions API (which
 * freezes the old page while the next one loads from the server, and isn't in older TV
 * browsers). The card the viewer picks records where its cover was; the screen it opens looks
 * for that record when it mounts and animates from there:
 * - `useFlyIn`: a copy of the cover flies from the card to the new screen's poster (FLIP).
 * - `useExpandIn`: the new screen (the player) grows out of the card's box.
 */

interface Origin {
  animeId: number;
  rect: DOMRect;
  src: string | null;
  radius: string;
  at: number;
}

// Records are only good for the navigation they started
const MAX_AGE_MS = 5000;
const EASING = "cubic-bezier(0.22, 1, 0.36, 1)";

let pending: Origin | null = null;

const clearOrigin = () => {
  pending = null;
};

const reducedMotion = () =>
  typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Called by a card when it is chosen; `el` is its cover box */
export function markOrigin(animeId: number, el: Element | null | undefined) {
  // A link or button without a cover (e.g. "Continuar") opens the next screen plainly
  if (!el) {
    pending = null;
    return;
  }
  const img = el.querySelector("img");
  pending = {
    animeId,
    rect: el.getBoundingClientRect(),
    src: img?.currentSrc || img?.src || null,
    radius: getComputedStyle(el).borderRadius,
    at: Date.now(),
  };
}

/** Whether a card for this anime was just chosen (read at first render, before it is used) */
export function hasOrigin(animeId: number) {
  return !!pending && pending.animeId === animeId && Date.now() - pending.at <= MAX_AGE_MS;
}

/**
 * The card's record, if it was for this anime and recent. It isn't cleared here but when the
 * animation starts (`clearOrigin`): React runs effects twice in development, and the second run
 * must still find it.
 */
function takeOrigin(animeId: number): Origin | null {
  const origin = pending;
  if (!origin || origin.animeId !== animeId || Date.now() - origin.at > MAX_AGE_MS) return null;
  // An off-screen card (scrolled away meanwhile) would fly in from nowhere
  if (origin.rect.width < 8 || origin.rect.bottom < 0 || origin.rect.top > window.innerHeight) return null;
  return origin;
}

/**
 * A copy of the chosen card's cover flies to `targetRef` (the new screen's poster). The real
 * poster stays hidden under it until it lands, so the page can fade in around it.
 */
export function useFlyIn(animeId: number, targetRef: RefObject<HTMLElement>, duration = 560) {
  useLayoutEffect(() => {
    const target = targetRef.current;
    const origin = takeOrigin(animeId);
    if (!origin) return;
    // Nowhere to land (no poster on this screen or layout): drop it, it was for this screen only
    if (!target || !origin.src || reducedMotion() || target.getClientRects().length === 0) return clearOrigin();

    // Hidden at once, so it doesn't show before the copy lands; measured a frame later, once
    // the router has scrolled the new page to the top
    const previousVisibility = target.style.visibility;
    target.style.visibility = "hidden";
    let ghost: HTMLImageElement | null = null;
    let animation: Animation | null = null;
    const finish = () => {
      target.style.visibility = previousVisibility;
      ghost?.remove();
    };

    const frame = requestAnimationFrame(() => {
      clearOrigin();
      const to = target.getBoundingClientRect();
      if (to.width < 8) return finish();
      ghost = document.createElement("img");
      ghost.src = origin.src!;
      ghost.alt = "";
      ghost.setAttribute("aria-hidden", "true");
      const radius = getComputedStyle(target).borderRadius;
      Object.assign(ghost.style, {
        position: "fixed",
        left: `${to.left}px`,
        top: `${to.top}px`,
        width: `${to.width}px`,
        height: `${to.height}px`,
        objectFit: "cover",
        borderRadius: radius,
        transformOrigin: "top left",
        zIndex: "60",
        pointerEvents: "none",
      } satisfies Partial<CSSStyleDeclaration>);
      document.body.appendChild(ghost);

      const dx = origin.rect.left - to.left;
      const dy = origin.rect.top - to.top;
      const sx = origin.rect.width / to.width;
      const sy = origin.rect.height / to.height;
      animation = ghost.animate(
        [
          { transform: `translate(${dx}px, ${dy}px) scale(${sx}, ${sy})`, borderRadius: origin.radius },
          { transform: "none", borderRadius: radius },
        ],
        { duration, easing: EASING }
      );
      animation.onfinish = finish;
      animation.oncancel = finish;
    });

    return () => {
      cancelAnimationFrame(frame);
      if (animation) animation.cancel();
      else finish();
    };
  }, [animeId, targetRef, duration]);
}

/** The new full-screen view (`targetRef`) opens out of the chosen card's box */
export function useExpandIn(animeId: number, targetRef: RefObject<HTMLElement>, duration = 520) {
  useLayoutEffect(() => {
    const target = targetRef.current;
    const origin = takeOrigin(animeId);
    if (!origin) return;
    if (!target || reducedMotion()) return clearOrigin();
    const { innerWidth: w, innerHeight: h } = window;
    const r = origin.rect;
    const from = `inset(${Math.max(0, r.top)}px ${Math.max(0, w - r.right)}px ${Math.max(0, h - r.bottom)}px ${Math.max(0, r.left)}px round ${origin.radius})`;
    // Clipped to the card right away (no full-screen flash), animated from the next frame
    target.style.clipPath = from;
    let animation: Animation | null = null;
    const frame = requestAnimationFrame(() => {
      clearOrigin();
      target.style.clipPath = "";
      animation = target.animate([{ clipPath: from }, { clipPath: "inset(0px 0px 0px 0px round 0px)" }], {
        duration,
        easing: EASING,
      });
    });
    return () => {
      cancelAnimationFrame(frame);
      target.style.clipPath = "";
      animation?.cancel();
    };
  }, [animeId, targetRef, duration]);
}

/**
 * Web layout: any link to an anime page or to the player that holds a `data-cover` box records
 * it on click, so cards need nothing more than that attribute. (TV cards are chosen with the
 * remote, not clicked, and call `markOrigin` themselves.)
 */
export function useOriginsFromClicks() {
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const link = (e.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!link || link.target === "_blank") return;
      const match = new URL(link.href, location.href).pathname.match(/^\/(?:anime|watch)\/(\d+)/);
      if (match) markOrigin(Number(match[1]), link.querySelector("[data-cover]"));
    };
    // Capture: recorded before the link's own handler starts the navigation
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, []);
}
