/**
 * Smooth-scrolls only when the position actually changes. Chromium runs a single programmatic
 * smooth scroll at a time, so a redundant call on one container (say, the page list) cancels
 * the animation in progress on another (the row being navigated).
 */
export function scrollToPosition(
  el: HTMLElement | null | undefined,
  target: { left?: number; top?: number },
  behavior: ScrollBehavior = "smooth"
): boolean {
  if (!el) return false;
  const left = target.left === undefined ? undefined : Math.max(0, Math.min(target.left, el.scrollWidth - el.clientWidth));
  const top = target.top === undefined ? undefined : Math.max(0, Math.min(target.top, el.scrollHeight - el.clientHeight));
  const moveX = left !== undefined && Math.abs(el.scrollLeft - left) > 1;
  const moveY = top !== undefined && Math.abs(el.scrollTop - top) > 1;
  if (!moveX && !moveY) return false;
  el.scrollTo({ ...(moveX ? { left } : {}), ...(moveY ? { top } : {}), behavior });
  return true;
}

/** Scrolls `container` vertically just enough to show `node` with `margin` px around it */
export function revealVertically(container: HTMLElement | null | undefined, node: HTMLElement, margin = 0): boolean {
  if (!container) return false;
  const box = container.getBoundingClientRect();
  const rect = node.getBoundingClientRect();
  if (rect.top - margin < box.top) {
    return scrollToPosition(container, { top: container.scrollTop + rect.top - box.top - margin });
  }
  if (rect.bottom + margin > box.bottom) {
    return scrollToPosition(container, { top: container.scrollTop + rect.bottom - box.bottom + margin });
  }
  return false;
}
