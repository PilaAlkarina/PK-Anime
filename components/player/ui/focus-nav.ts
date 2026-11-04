/**
 * Focus movement for the player's TV and keyboard navigation. A group is any element with
 * `data-nav`: "x" moves with Left/Right, "y" with Up/Down, "xy" with all four, in DOM order.
 */

export type NavAxis = "x" | "y" | "xy";

const FOCUSABLE = "button:not([disabled]), a[href], input:not([disabled])";

function isVisible(el: HTMLElement) {
  return el.getClientRects().length > 0;
}

export function focusables(group: HTMLElement): HTMLElement[] {
  return Array.from(group.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
    (el) => isVisible(el) && el.closest("[data-nav]") === group
  );
}

export function focusFirst(group: HTMLElement | null, selector?: string) {
  if (!group) return false;
  const preferred = selector ? group.querySelector<HTMLElement>(selector) : null;
  const target = preferred && isVisible(preferred) ? preferred : focusables(group)[0];
  if (!target) return false;
  target.focus({ preventScroll: true });
  return true;
}

/** Moves focus one step inside the element's group; false when the group has no item that way */
export function moveFocus(group: HTMLElement, step: 1 | -1) {
  const items = focusables(group);
  const index = items.indexOf(document.activeElement as HTMLElement);
  const next = items[index === -1 ? 0 : index + step];
  if (!next) return false;
  next.focus({ preventScroll: true });
  next.scrollIntoView({ block: "nearest", inline: "nearest" });
  return true;
}

/** Arrow key → step for a group's axis, or null when that arrow leaves the group alone */
export function arrowStep(key: string, axis: NavAxis): 1 | -1 | null {
  const horizontal = axis === "x" || axis === "xy";
  const vertical = axis === "y" || axis === "xy";
  if (key === "ArrowRight" && horizontal) return 1;
  if (key === "ArrowLeft" && horizontal) return -1;
  if (key === "ArrowDown" && vertical) return 1;
  if (key === "ArrowUp" && vertical) return -1;
  return null;
}
