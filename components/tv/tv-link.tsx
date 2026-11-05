"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import type { RemoteCommand, RemoteKey } from "@/lib/pairing/store";
import { authClient } from "@/lib/auth-client";
import { refreshAccount } from "@/lib/library/account";
import { REMOTE_TEXT_EVENT, setPendingRemoteText } from "@/lib/tv/remote-text";
import { useIsTv } from "@/components/ui-mode";
import type { UiMode } from "@/lib/ui-mode";
import { ProfileOfferDialog, type ProfileOffer } from "@/components/profile-offer";
import type { ProfileTransfer } from "@/lib/library/profile-transfer";

const STORAGE_KEY = "pk_tv_link";
const RECONNECT_MS = 3000;
const TOAST_MS = 3500;

export type TvLinkStatus = "idle" | "pending" | "linked";

export interface TvLinkState {
  status: TvLinkStatus;
  code: string | null;
  url: string | null;
  /** SVG markup of the QR for `url` */
  qr: string | null;
  expiresAt: number | null;
}

const IDLE: TvLinkState = { status: "idle", code: null, url: null, qr: null, expiresAt: null };

interface TvLink {
  /** False outside the library (the standalone embed player), where there is nothing to link */
  available: boolean;
  state: TvLinkState;
  /** Shows a fresh QR, replacing a pending one; false when the server didn't hand one out */
  startLinking: () => Promise<boolean>;
  unlink: () => Promise<void>;
}

const TvLinkContext = createContext<TvLink>({
  available: false,
  state: IDLE,
  startLinking: async () => false,
  unlink: async () => {},
});

export const useTvLink = () => useContext(TvLinkContext);

/**
 * Reloads the current page in the other interface. The server picks it up from `?ui=`, keeps it
 * in a cookie and drops the parameter.
 */
export function switchUiMode(mode: UiMode | "auto") {
  const url = new URL(window.location.href);
  url.searchParams.set("ui", mode);
  window.location.assign(url.toString());
}

/** Seconds left on a pending code; an expired one is replaced while the caller stays mounted */
export function useLinkCountdown() {
  const { state, startLinking } = useTvLink();
  const until = state.status === "pending" ? state.expiresAt : null;
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!until) return;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [until]);
  const secondsLeft = until ? Math.max(0, Math.round((until - now) / 1000)) : 0;
  useEffect(() => {
    if (until && secondsLeft === 0) startLinking();
  }, [until, secondsLeft, startLinking]);
  return secondsLeft;
}

// What the TV's own remote would send for each phone button. keyCode is legacy but some of
// our listeners (and spatial navigation) still read it.
const KEYS: Record<RemoteKey, { key: string; code?: string; keyCode: number }> = {
  ArrowUp: { key: "ArrowUp", code: "ArrowUp", keyCode: 38 },
  ArrowDown: { key: "ArrowDown", code: "ArrowDown", keyCode: 40 },
  ArrowLeft: { key: "ArrowLeft", code: "ArrowLeft", keyCode: 37 },
  ArrowRight: { key: "ArrowRight", code: "ArrowRight", keyCode: 39 },
  Enter: { key: "Enter", code: "Enter", keyCode: 13 },
  Back: { key: "Escape", code: "Escape", keyCode: 27 },
  PlayPause: { key: "MediaPlayPause", keyCode: 179 },
  FastForward: { key: "MediaFastForward", keyCode: 417 },
  Rewind: { key: "MediaRewind", keyCode: 412 },
};

function pressKey(key: RemoteKey) {
  const init = { ...KEYS[key], bubbles: true, cancelable: true } as KeyboardEventInit;
  const target = document.activeElement || document.body;
  target.dispatchEvent(new KeyboardEvent("keydown", init));
  target.dispatchEvent(new KeyboardEvent("keyup", init));
}

function readToken() {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function writeToken(token: string | null) {
  try {
    if (token) localStorage.setItem(STORAGE_KEY, token);
    else localStorage.removeItem(STORAGE_KEY);
  } catch {}
}

/**
 * The TV side of the phone link: keeps the event stream open, runs the phone's commands as
 * key presses (so every screen and the player react as to the TV's own remote), and picks up
 * a session handed over from the phone.
 */
export function TvLinkProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  // The PC interface isn't built for a d-pad: linking a phone there moves to the TV one
  const isTv = useIsTv();
  const isTvRef = useRef(isTv);
  isTvRef.current = isTv;
  const pathname = usePathname();
  const [state, setState] = useState<TvLinkState>(IDLE);
  const [toast, setToast] = useState<string | null>(null);
  const tokenRef = useRef<string | null>(null);
  const sourceRef = useRef<EventSource | null>(null);
  const reconnectRef = useRef<ReturnType<typeof setTimeout>>();
  const pathnameRef = useRef(pathname);
  pathnameRef.current = pathname;

  // A profile the phone sent, waiting for the TV to say what to do with it
  const [profileOffer, setProfileOffer] = useState<ProfileOffer | null>(null);
  const takeProfile = useCallback(async (): Promise<ProfileTransfer | null> => {
    const data = await fetch("/api/pair/profile/accept", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tvToken: tokenRef.current }),
    })
      .then((res) => res.json())
      .catch(() => null);
    return data?.success ? (data.profile as ProfileTransfer) : null;
  }, []);

  const showToast = useCallback((message: string) => {
    setToast(message);
    setTimeout(() => setToast((current) => (current === message ? null : current)), TOAST_MS);
  }, []);

  const close = () => {
    clearTimeout(reconnectRef.current);
    sourceRef.current?.close();
    sourceRef.current = null;
  };

  const forget = useCallback(() => {
    close();
    tokenRef.current = null;
    writeToken(null);
    setState(IDLE);
  }, []);

  const runCommand = useCallback(
    (command: RemoteCommand) => {
      if (command.kind === "key") pressKey(command.key);
      else if (command.kind === "navigate") router.push(command.href);
      else if (command.kind === "signout") authClient.signOut().finally(() => refreshAccount());
      else if (command.kind === "text") {
        if (pathnameRef.current === "/search") {
          window.dispatchEvent(new CustomEvent(REMOTE_TEXT_EVENT, { detail: command.text }));
        } else {
          setPendingRemoteText(command.text);
          router.push("/search");
        }
      }
    },
    [router]
  );

  const acceptSession = useCallback(
    async (name: string) => {
      const res = await fetch("/api/pair/session/accept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tvToken: tokenRef.current }),
      }).catch(() => null);
      if (!res?.ok) return showToast("No se pudo iniciar sesión en la TV");
      await refreshAccount();
      showToast(`Sesión iniciada como ${name}`);
    },
    [showToast]
  );

  const sync = useCallback(
    async (create: boolean) => {
      const data = await fetch("/api/pair", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tvToken: tokenRef.current, create }),
      })
        .then((res) => res.json())
        .catch(() => null);
      if (!data) return false;
      if (!data.success || data.status === "missing") {
        forget();
        return false;
      }
      tokenRef.current = data.tvToken;
      writeToken(data.tvToken);
      setState({ status: data.status, code: data.code, url: data.url, qr: data.qr, expiresAt: data.expiresAt });
      listen();
      return true;
    },
    // listen is defined below; it only reads refs and stable callbacks
    [forget]
  );

  const listen = () => {
    if (sourceRef.current || !tokenRef.current) return;
    const source = new EventSource(`/api/pair/events?tv=${encodeURIComponent(tokenRef.current)}`);
    sourceRef.current = source;
    source.onmessage = (e) => {
      let event: any;
      try {
        event = JSON.parse(e.data);
      } catch {
        return;
      }
      if (event.type === "state") {
        setState((s) => ({ ...s, status: event.status, code: event.code, expiresAt: event.expiresAt }));
      } else if (event.type === "linked") {
        setState({ ...IDLE, status: "linked" });
        if (isTvRef.current) showToast("Móvil vinculado");
        else switchUiMode("tv");
      } else if (event.type === "unlinked") {
        forget();
        showToast("Móvil desvinculado");
      } else if (event.type === "command") {
        runCommand(event.command);
      } else if (event.type === "session") {
        acceptSession(event.name);
      } else if (event.type === "profile") {
        setProfileOffer({ name: event.name, entries: event.entries, history: event.history });
      }
    };
    // EventSource retries on its own, but not after a 404 (a link the server dropped, e.g.
    // after a restart): reconnect by hand, which also notices the link is gone
    source.onerror = () => {
      close();
      reconnectRef.current = setTimeout(() => sync(false), RECONNECT_MS);
    };
  };

  useEffect(() => {
    tokenRef.current = readToken();
    if (tokenRef.current) sync(false);
    return close;
  }, [sync]);

  const startLinking = useCallback(async () => {
    if (tokenRef.current && state.status === "pending") {
      await fetch("/api/pair/unlink", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tvToken: tokenRef.current }),
      }).catch(() => {});
      forget();
    }
    return sync(true);
  }, [state.status, forget, sync]);

  const unlink = useCallback(async () => {
    const tvToken = tokenRef.current;
    forget();
    if (!tvToken) return;
    await fetch("/api/pair/unlink", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tvToken }),
    }).catch(() => {});
  }, [forget]);

  return (
    <TvLinkContext.Provider value={{ available: true, state, startLinking, unlink }}>
      {children}
      {profileOffer && (
        <ProfileOfferDialog
          offer={profileOffer}
          take={takeProfile}
          onClose={(message) => {
            setProfileOffer(null);
            if (message) showToast(message);
          }}
        />
      )}
      {toast && (
        <div className="fixed right-4 bottom-20 z-[80] px-4 py-3 rounded-2xl bg-zinc-900/95 text-sm font-bold tv-fade-in md:bottom-6 tv:right-[4vw] tv:bottom-[6vh] tv:px-6 tv:py-4 tv:text-xl">
          {toast}
        </div>
      )}
    </TvLinkContext.Provider>
  );
}
