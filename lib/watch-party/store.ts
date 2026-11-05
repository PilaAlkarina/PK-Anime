import { randomBytes, randomInt } from "crypto";

/**
 * "Ver juntos" rooms, kept in this server process's memory like the phone links (one
 * self-hosted instance). A room has a short code, the episode being watched and where playback
 * is; every member gets each change as it happens and applies it to its own player.
 */

export interface PartyState {
  animeId: number;
  episode: number;
  audio: "sub" | "dub";
  playing: boolean;
  /** Seconds into the episode when the state was set */
  position: number;
  /** Server time of the change, ms */
  at: number;
  /** Who made the change */
  by: string | null;
}

export type PartyEvent =
  | { type: "state"; state: PartyState; serverNow: number }
  | { type: "members"; names: string[] };

interface Member {
  name: string;
  listeners: Set<(event: PartyEvent) => void>;
  touchedAt: number;
}

interface Party {
  code: string;
  state: PartyState;
  members: Map<string, Member>;
  createdAt: number;
}

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const CODE_LENGTH = 6;
const MAX_PARTIES = 100;
const MAX_MEMBERS = 12;
/** A room nobody is connected to goes away after this */
const IDLE_TTL = 30 * 60 * 1000;

const g = globalThis as typeof globalThis & { __pkParties?: Map<string, Party> };
const parties = (g.__pkParties ??= new Map<string, Party>());

const listening = (party: Party) => Array.from(party.members.values()).some((m) => m.listeners.size > 0);

function sweep() {
  const now = Date.now();
  for (const [code, party] of parties) {
    const last = Math.max(party.createdAt, ...Array.from(party.members.values()).map((m) => m.touchedAt));
    if (!listening(party) && now - last > IDLE_TTL) parties.delete(code);
  }
}

function newCode() {
  for (;;) {
    let code = "";
    for (let i = 0; i < CODE_LENGTH; i++) code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
    if (!parties.has(code)) return code;
  }
}

export const normalizeCode = (code: unknown) =>
  typeof code === "string" ? code.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, CODE_LENGTH) : "";

export const cleanName = (name: unknown) =>
  typeof name === "string" && name.trim() ? name.trim().slice(0, 20) : "Alguien";

export function findParty(code: unknown) {
  return parties.get(normalizeCode(code)) ?? null;
}

function emitAll(party: Party, event: PartyEvent, except?: string) {
  for (const [id, member] of party.members) {
    if (id !== except) member.listeners.forEach((l) => l(event));
  }
}

export function memberNames(party: Party) {
  return Array.from(party.members.values())
    .filter((m) => m.listeners.size > 0)
    .map((m) => m.name);
}

function announceMembers(party: Party) {
  emitAll(party, { type: "members", names: memberNames(party) });
}

export function createParty(state: Omit<PartyState, "at" | "by" | "playing" | "position">, name: string) {
  sweep();
  if (parties.size >= MAX_PARTIES) return null;
  const now = Date.now();
  const party: Party = {
    code: newCode(),
    state: { ...state, playing: false, position: 0, at: now, by: null },
    members: new Map(),
    createdAt: now,
  };
  parties.set(party.code, party);
  const member = joinParty(party, name)!;
  return { party, member };
}

export function joinParty(party: Party, name: string) {
  if (party.members.size >= MAX_MEMBERS) return null;
  const id = randomBytes(12).toString("base64url");
  party.members.set(id, { name, listeners: new Set(), touchedAt: Date.now() });
  return id;
}

/** A member changed the episode, paused, played or jumped: everyone else follows */
export function setState(party: Party, memberId: string, changes: Partial<Pick<PartyState, "episode" | "audio" | "playing" | "position">>) {
  const member = party.members.get(memberId);
  if (!member) return false;
  member.touchedAt = Date.now();
  party.state = { ...party.state, ...changes, at: Date.now(), by: member.name };
  emitAll(party, { type: "state", state: party.state, serverNow: Date.now() }, memberId);
  return true;
}

export function listen(party: Party, memberId: string, listener: (event: PartyEvent) => void) {
  const member = party.members.get(memberId);
  if (!member) return null;
  member.listeners.add(listener);
  member.touchedAt = Date.now();
  announceMembers(party);
  return () => {
    member.listeners.delete(listener);
    member.touchedAt = Date.now();
    announceMembers(party);
  };
}

export function leaveParty(party: Party, memberId: string) {
  party.members.delete(memberId);
  if (party.members.size === 0) parties.delete(party.code);
  else announceMembers(party);
}
