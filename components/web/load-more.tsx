"use client";

import { useEffect, useRef } from "react";

/**
 * Invisible marker at the end of a list or row: asks for the next page when it gets close
 * to the viewport (or to the edge of a horizontal scroller). `root` is that scroller.
 */
export function LoadMore({
  onVisible,
  root,
  className,
}: {
  onVisible: () => void;
  root?: React.RefObject<HTMLElement>;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const callbackRef = useRef(onVisible);
  callbackRef.current = onVisible;

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) callbackRef.current();
      },
      { root: root?.current ?? null, rootMargin: "600px" }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [root]);

  return <div ref={ref} aria-hidden className={className ?? "h-px"} />;
}
