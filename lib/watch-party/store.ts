import { randomBytes, randomInt } from "crypto";

/**
 * "Ver juntos" rooms, kept in this server process's memory like the phone links (one
 * self-hosted instance). A room exists apart from any episode: its host picks what to watch,
 * and everyone in it is taken there. Each pick starts in a lobby: the episode stays at 0:00
 * until every connected member has loaded it (or the host starts anyway), then all start at
 * the same moment. While playing, anyone's pause, play or jump goes to the others.
 */

export type PartyPhase = "idle" | "lobby" | "playing";

export interface PartyState {
  phase: PartyPhase;
  animeId: number | null;
  episode: number | null;
  audio: "sub" | "dub";
  playing: boolean;
  /** Seconds into the episode when the state was set */
  position: number;
  /** Server time of the change, ms; for "playing" right after a lobby, the moment to start */
  at: number;
  /** Who made the last change */
  by: string | null;
}

export interface PublicMember {
  id: string;
  name: string;
  host: boolean;
  /** Loaded the episode the lobby is waiting on */
  ready: boolean;
  connected: boolean;
}

export interface PartySnapshot {
  code: string;
  state: PartyState;
  members: PublicMember[];
}

export type PartyEvent =
  | { type: "snapshot"; party: PartySnapshot; serverNow: number }
  | { type: "closed" };

interface Member {
  /** Shown to the others */
  publicId: string;
  name: string;
  ready: boolean;
  listeners: Set<(event: PartyEvent) => void>;
  touchedAt: number;
}

interface Party {
  code: string;
  /** Secret member ID of the host */
  hostId: string;
  state: PartyState;
  /** By secret member ID */
  members: Map<string, Member>;
  createdAt: number;
}

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const CODE_LENGTH = 6;
const MAX_PARTIES = 100;
const MAX_MEMBERS = 12;
/** A room nobody is connected to goes away after this */
const IDLE_TTL = 30 * 60 * 1000;
/** Everyone ready: playback starts this long after, so all get the order before it */
const START_DELAY_MS = 1500;

const g = globalThis as typeof globalThis & { __pkParties2?: Map<string, Party> };
const parties = (g.__pkParties2 ??= new Map<string, Party>());

const connected = (m: Member) => m.listeners.size > 0;

function sweep() {
  const now = Date.now();
  for (const [code, party] of parties) {
    const last = Math.max(party.createdAt, ...Array.from(party.members.values()).map((m) => m.touchedAt));
    if (!Array.from(party.members.values()).some(connected) && now - last > IDLE_TTL) parties.delete(code);
  }
}

function newCode() {
  for (;;) {
    let code = "";
    for (let i = 0; i < CODE_LENGTH; i++) code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
    if (!parties.has(code)) return code;
  }
}

const secret = () => randomBytes(16).toString("base64url");

export const normalizeCode = (code: unknown) =>
  typeof code === "string" ? code.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, CODE_LENGTH) : "";

export const cleanName = (name: unknown) =>
  typeof name === "string" && name.trim() ? name.trim().slice(0, 20) : "Alguien";

export function findParty(code: unknown) {
  return parties.get(normalizeCode(code)) ?? null;
}

export function snapshot(party: Party): PartySnapshot {
  return {
    code: party.code,
    state: party.state,
    members: Array.from(party.members.entries()).map(([id, m]) => ({
      id: m.publicId,
      name: m.name,
      host: id === party.hostId,
      ready: m.ready,
      connected: connected(m),
    })),
  };
}

function broadcast(party: Party) {
  const event: PartyEvent = { type: "snapshot", party: snapshot(party), serverNow: Date.now() };
  party.members.forEach((m) => m.listeners.forEach((l) => l(event)));
}

export function publicIdOf(party: Party, memberId: string) {
  return party.members.get(memberId)?.publicId ?? null;
}

export function createParty(name: string) {
  sweep();
  if (parties.size >= MAX_PARTIES) return null;
  const now = Date.now();
  const hostId = secret();
  const party: Party = {
    code: newCode(),
    hostId,
    state: { phase: "idle", animeId: null, episode: null, audio: "sub", playing: false, position: 0, at: now, by: null },
    members: new Map([[hostId, { publicId: secret().slice(0, 8), name, ready: false, listeners: new Set(), touchedAt: now }]]),
    createdAt: now,
  };
  parties.set(party.code, party);
  return { party, member: hostId };
}

export function joinParty(party: Party, name: string) {
  if (party.members.size >= MAX_MEMBERS) return null;
  const id = secret();
  party.members.set(id, { publicId: secret().slice(0, 8), name, ready: false, listeners: new Set(), touchedAt: Date.now() });
  broadcast(party);
  return id;
}

/** Starts the lobby's episode for everyone, now that all connected members have it loaded */
function maybeStart(party: Party, force = false) {
  if (party.state.phase !== "lobby") return;
  const waiting = Array.from(party.members.values()).filter((m) => connected(m) && !m.ready);
  if (waiting.length > 0 && !force) return;
  party.state = { ...party.state, phase: "playing", playing: true, position: 0, at: Date.now() + START_DELAY_MS };
}

/** The host picks what to watch: everyone goes to its lobby */
export function selectEpisode(party: Party, memberId: string, pick: { animeId: number; episode: number; audio: "sub" | "dub" }) {
  if (memberId !== party.hostId) return "NOT_HOST";
  party.members.forEach((m) => (m.ready = false));
  const host = party.members.get(memberId)!;
  party.state = { ...pick, phase: "lobby", playing: false, position: 0, at: Date.now(), by: host.name };
  broadcast(party);
  return "OK";
}

/** A member has the lobby's episode loaded */
export function markReady(party: Party, memberId: string, pick: { animeId: number; episode: number }) {
  const member = party.members.get(memberId);
  if (!member) return false;
  member.touchedAt = Date.now();
  if (party.state.animeId !== pick.animeId || party.state.episode !== pick.episode) return true;
  member.ready = true;
  maybeStart(party);
  broadcast(party);
  return true;
}

/** The host starts without waiting for the slow ones */
export function startNow(party: Party, memberId: string) {
  if (memberId !== party.hostId) return "NOT_HOST";
  maybeStart(party, true);
  broadcast(party);
  return "OK";
}

/** Play, pause or a jump while watching: everyone follows */
export function setPlayback(party: Party, memberId: string, changes: { playing?: boolean; position?: number }) {
  const member = party.members.get(memberId);
  if (!member) return false;
  member.touchedAt = Date.now();
  if (party.state.phase !== "playing") return true;
  party.state = { ...party.state, ...changes, at: Date.now(), by: member.name };
  broadcast(party);
  return true;
}

export function listen(party: Party, memberId: string, listener: (event: PartyEvent) => void) {
  const member = party.members.get(memberId);
  if (!member) return null;
  member.listeners.add(listener);
  member.touchedAt = Date.now();
  broadcast(party);
  return () => {
    member.listeners.delete(listener);
    member.touchedAt = Date.now();
    // Someone who drops out of the lobby isn't waited for
    maybeStart(party);
    broadcast(party);
  };
}

/** Leaves the room; the host hands it to the next member, and the last one closes it */
export function leaveParty(party: Party, memberId: string) {
  const member = party.members.get(memberId);
  if (!member) return;
  party.members.delete(memberId);
  member.listeners.forEach((l) => l({ type: "closed" }));
  if (party.members.size === 0) {
    parties.delete(party.code);
    return;
  }
  if (memberId === party.hostId) {
    const next = Array.from(party.members.entries()).find(([, m]) => connected(m)) ?? Array.from(party.members.entries())[0];
    party.hostId = next[0];
  }
  maybeStart(party);
  broadcast(party);
}
