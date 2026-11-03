import { useEffect, useSyncExternalStore } from "react";
import type { TrackerId } from "@/lib/trackers/types";

/** The list service account signed in on this device, from /api/tracker/me */
export interface Account {
  signedIn: boolean;
  provider: { id: TrackerId; name: string } | null;
  user: { name: string; image: string | null } | null;
  /** Services this server can sign in with */
  providers: { id: TrackerId; name: string }[];
}

const listeners = new Set<() => void>();
let account: Account | null = null;
let inFlight: Promise<Account | null> | null = null;

function set(next: Account | null) {
  account = next;
  listeners.forEach((l) => l());
}

export function refreshAccount() {
  inFlight ??= fetch("/api/tracker/me", { cache: "no-store" })
    .then((res) => res.json())
    .then((data) => {
      const next: Account | null = data.success
        ? { signedIn: data.signedIn, provider: data.provider, user: data.user, providers: data.providers }
        : null;
      set(next);
      return next;
    })
    .catch(() => null)
    .finally(() => {
      inFlight = null;
    });
  return inFlight;
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

/** null until the first answer arrives; fetched once and shared by every screen */
export function useAccount() {
  const value = useSyncExternalStore(subscribe, () => account, () => null);
  useEffect(() => {
    if (!account) refreshAccount();
  }, []);
  return value;
}
