"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

/** Navigations faster than this never show the bar */
const SHOW_AFTER_MS = 150;

type Listener = (delta: 1 | -1) => void;
const listeners = new Set<Listener>();
let installed = false;

/**
 * Every client navigation (links, router.push on TV, Back) asks the server for the next page
 * with an `RSC: 1` request. Watching fetch for those, minus prefetches and server actions, tells
 * when one starts and when its payload has fully arrived, wherever it was triggered.
 */
function installFetchWatch() {
  if (installed || typeof window === "undefined") return;
  installed = true;
  const original = window.fetch.bind(window);
  window.fetch = (input, init) => {
    const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
    const isNavigation =
      headers.get("RSC") === "1" && !headers.has("Next-Router-Prefetch") && !headers.has("Next-Action");
    const request = original(input, init);
    if (!isNavigation) return request;
    listeners.forEach((l) => l(1));
    let ended = false;
    const end = () => {
      if (ended) return;
      ended = true;
      listeners.forEach((l) => l(-1));
    };
    request
      .then((response) => {
        // Done once the whole payload is in (read from a copy; the router reads the original)
        response
          .clone()
          .arrayBuffer()
          .catch(() => {})
          .finally(end);
      })
      .catch(end);
    return request;
  };
}

/**
 * A thin accent bar at the top while the next page loads: it rushes to a third, creeps on while
 * waiting, then fills and fades when the page is in.
 */
export function NavigationProgress() {
  const pathname = usePathname();
  const [state, setState] = useState<"idle" | "loading" | "done">("idle");
  const active = useRef(0);
  const showTimer = useRef<ReturnType<typeof setTimeout>>();
  const hideTimer = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    installFetchWatch();
    const listener: Listener = (delta) => {
      active.current = Math.max(0, active.current + delta);
      if (active.current > 0) {
        clearTimeout(hideTimer.current);
        if (!showTimer.current) showTimer.current = setTimeout(() => setState("loading"), SHOW_AFTER_MS);
      } else {
        finish();
      }
    };
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, []);

  const finish = () => {
    clearTimeout(showTimer.current);
    showTimer.current = undefined;
    setState((s) => (s === "loading" ? "done" : s));
    clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => setState("idle"), 450);
  };

  // The new page is on screen: whatever is pending is over
  useEffect(() => {
    active.current = 0;
    finish();
  }, [pathname]);

  return (
    <div aria-hidden className="fixed top-0 left-0 right-0 z-[70] h-[3px] pointer-events-none">
      <div
        className={cn(
          "h-full bg-red-500 origin-left shadow-[0_0_8px_rgba(var(--c-accent),0.6)]",
          state === "idle" && "opacity-0 scale-x-0 transition-none",
          state === "loading" && "opacity-100 nav-progress-creep",
          state === "done" && "opacity-0 scale-x-100 transition-[transform,opacity] duration-300 ease-out"
        )}
      />
    </div>
  );
}
