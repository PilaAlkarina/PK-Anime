import type { PartySnapshot, PartyState } from "./store";
import { activeProfile } from "@/lib/library/profiles";

export type { PartySnapshot, PartyState };

/**
 * The browser side of "Ver juntos": the room this device is in (kept per device, so a reload or
 * another page keeps it) and the calls to /api/party. The live part is PartyProvider.
 */

const KEY = "pk_party";

export interface Membership {
  code: string;
  /** Secret member ID, sent with every change */
  member: string;
  /** This device's public ID in the room's member list */
  you: string;
}

export function readMembership(): Membership | null {
  try {
    const stored = JSON.parse(localStorage.getItem(KEY) || "null");
    return stored?.code && stored?.member ? stored : null;
  } catch {
    return null;
  }
}

export function writeMembership(membership: Membership | null) {
  try {
    if (membership) localStorage.setItem(KEY, JSON.stringify(membership));
    else localStorage.removeItem(KEY);
  } catch {}
}

export async function partyPost(path: string, body: unknown) {
  const res = await fetch(`/api/party${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }).catch(() => null);
  const data = res ? await res.json().catch(() => ({})) : {};
  return { status: res?.status ?? 0, data };
}

/** How this device shows up to the others in a room: its profile, else the account, else the device */
export function deviceName(accountName: string | null | undefined, isTv: boolean) {
  const profile = activeProfile();
  if (profile.id !== "main") return profile.name;
  return accountName || (isTv ? "La TV" : "Alguien");
}

export const joinError = (code: string | undefined) =>
  code === "UNKNOWN_ROOM"
    ? "No hay ninguna sala con ese código."
    : code === "ROOM_FULL"
      ? "La sala está llena."
      : "No se pudo entrar en la sala.";

/** The watch page of a room's pick */
export const pickHref = (state: Pick<PartyState, "animeId" | "episode" | "audio">) =>
  `/watch/${state.animeId}/${state.episode}?audio=${state.audio}`;
