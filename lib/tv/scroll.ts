/**
 * Smooth-scrolls only when the position actually changes. Chromium runs a single programmatic
 * smooth scroll at a time, so a redundant call on one container (say, the page list) cancels
 * the animation in progress on another (the row being navigated).
 */
export function scrollToPosition(el: HTMLElement | null | undefined, target: { left?: number; top?: number }) {
  if (!el) return;
  const left = target.left === undefined ? undefined : Math.max(0, Math.min(target.left, el.scrollWidth - el.clientWidth));
  const top = target.top === undefined ? undefined : Math.max(0, Math.min(target.top, el.scrollHeight - el.clientHeight));
  const moveX = left !== undefined && Math.abs(el.scrollLeft - left) > 1;
  const moveY = top !== undefined && Math.abs(el.scrollTop - top) > 1;
  if (!moveX && !moveY) return;
  el.scrollTo({ ...(moveX ? { left } : {}), ...(moveY ? { top } : {}), behavior: "smooth" });
}
