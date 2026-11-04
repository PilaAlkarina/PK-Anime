"use client";

import { createContext, useCallback, useContext, useEffect, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import { init, pause, resume } from "@noriginmedia/norigin-spatial-navigation";
import { isBackKey } from "@/lib/tv/keys";

let initialized = false;

// Must run before any useFocusable registers, and children's effects run before this
// provider's, so it happens while the provider first renders. Only the TV layout renders
// the provider: in the web layout spatial navigation is never switched on.
function initSpatialNavigation() {
  if (initialized || typeof window === "undefined") return;
  initialized = true;
  init({
    // Real DOM focus keeps inputs typeable and screen readers in sync; scrolling is ours
    shouldFocusDOMNode: true,
    domNodeFocusOptions: { preventScroll: true },
  });
}

/** Returns true when it handled Back, so outer handlers and the page change are skipped */
type BackHandler = (e: KeyboardEvent) => boolean | void;

interface LibraryNavigation {
  goBack: () => void;
  /** router.replace that keeps the library's own history in step */
  replace: (href: string) => void;
  /**
   * Goes to `href` as if it were the page before: back, when it is (so it keeps its scroll and
   * state), or in place of this page otherwise, so Back from there skips this one. The player's
   * "Episodios" uses it to reach the anime page from wherever playback was started.
   */
  backTo: (href: string) => void;
  registerBackHandler: (handler: BackHandler) => () => void;
}

const NavigationContext = createContext<LibraryNavigation>({
  goBack: () => {},
  replace: () => {},
  backTo: () => {},
  registerBackHandler: () => () => {},
});

/** Where Back leads when the library was opened directly on this page */
export function parentPath(pathname: string) {
  const watch = pathname.match(/^\/watch\/(\d+)/);
  if (watch) return `/anime/${watch[1]}`;
  if (/^\/genres\/.+/.test(pathname)) return "/genres";
  return "/";
}

export function NavigationProvider({ children }: { children: React.ReactNode }) {
  initSpatialNavigation();
  const router = useRouter();
  const pathname = usePathname();
  const historyRef = useRef<string[]>([]);
  const handlersRef = useRef<BackHandler[]>([]);

  // Arrow keys must keep scrolling normally on routes outside the library
  useEffect(() => {
    resume();
    return () => pause();
  }, []);

  // Paths visited inside the library, so Back never leaves the site when opened from a link
  useEffect(() => {
    const visited = historyRef.current;
    if (visited[visited.length - 2] === pathname) visited.pop();
    else if (visited[visited.length - 1] !== pathname) visited.push(pathname);
  }, [pathname]);

  const goBack = useCallback(() => {
    if (historyRef.current.length > 1) {
      router.back();
      return;
    }
    const parent = parentPath(pathname);
    if (parent !== pathname) router.replace(parent);
  }, [router, pathname]);

  const replace = useCallback(
    (href: string) => {
      const visited = historyRef.current;
      visited[Math.max(0, visited.length - 1)] = href.split("?")[0];
      router.replace(href);
    },
    [router]
  );

  const backTo = useCallback(
    (href: string) => {
      const visited = historyRef.current;
      if (visited[visited.length - 2] === href.split("?")[0]) router.back();
      else replace(href);
    },
    [router, replace]
  );

  const goBackRef = useRef(goBack);
  goBackRef.current = goBack;

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!isBackKey(e)) return;
      e.preventDefault();
      const handlers = handlersRef.current;
      for (let i = handlers.length - 1; i >= 0; i--) {
        if (handlers[i](e) === true) return;
      }
      goBackRef.current();
    };
    // Capture phase, so Back is resolved before the player or any input sees it
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, []);

  const registerBackHandler = useCallback((handler: BackHandler) => {
    handlersRef.current.push(handler);
    return () => {
      handlersRef.current = handlersRef.current.filter((h) => h !== handler);
    };
  }, []);

  return (
    <NavigationContext.Provider value={{ goBack, replace, backTo, registerBackHandler }}>
      {children}
    </NavigationContext.Provider>
  );
}

/**
 * The same navigation API for the web layout: the browser's own Back button and history
 * do the work, so there are no Back-key handlers to run.
 */
export function WebNavigationProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  // The page before this one inside the site, for backTo (the browser doesn't expose its history)
  const previousRef = useRef<string | null>(null);
  const currentRef = useRef<string | null>(null);
  useEffect(() => {
    if (currentRef.current !== pathname) previousRef.current = currentRef.current;
    currentRef.current = pathname;
  }, [pathname]);

  const goBack = useCallback(() => {
    if (window.history.length > 1) router.back();
    else router.replace(parentPath(pathname));
  }, [router, pathname]);

  const replace = useCallback((href: string) => router.replace(href), [router]);
  const backTo = useCallback(
    (href: string) => {
      if (previousRef.current === href.split("?")[0]) router.back();
      else router.replace(href);
    },
    [router]
  );
  const registerBackHandler = useCallback(() => () => {}, []);

  return (
    <NavigationContext.Provider value={{ goBack, replace, backTo, registerBackHandler }}>
      {children}
    </NavigationContext.Provider>
  );
}

export function useLibraryNavigation() {
  return useContext(NavigationContext);
}

/** Intercepts Back while `handler` is set, e.g. to close an overlay before leaving the page */
export function useBackHandler(handler: BackHandler | null) {
  const { registerBackHandler } = useLibraryNavigation();
  const handlerRef = useRef(handler);
  handlerRef.current = handler;
  const active = !!handler;

  useEffect(() => {
    if (!active) return;
    return registerBackHandler((e) => handlerRef.current?.(e));
  }, [active, registerBackHandler]);
}
