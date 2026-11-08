import { randomBytes, randomInt } from "crypto";

/**
 * "Ver juntos" rooms, kept in this server process's memory like the phone links (one
 * self-hosted instance). A room exists apart from any episode: its host picks what to watch,
 * and everyone in it is taken there.
 *
 * Every moment that needs everyone at the same frame goes through a barrier: a new pick (at
 * 0:00), a pause, the host's jump, a resume, or a device that ran out of buffer. While one is
 * open every player stays paused:
 *  1. For a pause or a stall the target isn't known yet: each device reports where it stopped
 *     and the earliest wins (better to see a second twice than to miss it).
 *  2. Every device goes to the target and reports once it has it buffered.
 *  3. Then the barrier closes: paused there, or playing from there at a start time everyone was
 *     given in advance.
 * A device that doesn't answer in time isn't waited for. Only the host jumps.
 */

export type PartyPhase = "idle" | "watching";
export type BarrierKind = "pick" | "pause" | "seek" | "resume" | "stall";

export interface PartyBarrier {
  id: number;
  kind: BarrierKind;
  /** Where everyone goes; null while the positions of a pause or a stall are being collected */
  position: number | null;
  /** Play from there once everyone is ready */
  resume: boolean;
  /** Who opened it */
  by: string;
  /** Public IDs of the members who reported where they were (step 1) */
  reported: string[];
  /** Public IDs of the members who have the target buffered (step 2) */
  ready: string[];
}

export interface PartyState {
  phase: PartyPhase;
  animeId: number | null;
  episode: number | null;
  audio: "sub" | "dub";
  playing: boolean;
  /** Seconds into the episode at `at` */
  position: number;
  /** Server time, ms: when `position` holds (for a start, a moment just ahead) */
  at: number;
  barrier: PartyBarrier | null;
}

export interface PublicMember {
  id: string;
  name: string;
  host: boolean;
  connected: boolean;
  /** On another page: not waited for */
  away: boolean;
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
  publicId: string;
  name: string;
  away: boolean;
  listeners: Set<(event: PartyEvent) => void>;
  touchedAt: number;
}

interface Party {
  code: string;
  hostId: string;
  state: PartyState;
  members: Map<string, Member>;
  createdAt: number;
  nextBarrier: number;
  /** Positions reported for the open barrier, by public ID */
  positions: Map<string, number>;
  timer: ReturnType<typeof setTimeout> | null;
}

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const CODE_LENGTH = 6;
const MAX_PARTIES = 100;
const MAX_MEMBERS = 12;
const IDLE_TTL = 30 * 60 * 1000;
/** Everyone ready: playback starts this long after, so all get the order before it */
const START_DELAY_MS = 1500;
/** Waiting for positions (step 1) and for buffers (step 2); a pick waits longer, it loads a page */
const REPORT_TIMEOUT_MS = 3000;
const READY_TIMEOUT_MS = 10_000;
const PICK_TIMEOUT_MS = 45_000;

const g = globalThis as typeof globalThis & { __pkParties3?: Map<string, Party> };
const parties = (g.__pkParties3 ??= new Map<string, Party>());

const connected = (m: Member) => m.listeners.size > 0;

function sweep() {
  const now = Date.now();
  for (const [code, party] of parties) {
    const last = Math.max(party.createdAt, ...Array.from(party.members.values()).map((m) => m.touchedAt));
    if (!Array.from(party.members.values()).some(connected) && now - last > IDLE_TTL) {
      if (party.timer) clearTimeout(party.timer);
      parties.delete(code);
    }
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
      connected: connected(m),
      away: m.away,
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

/** The members a barrier waits for: connected and on the episode */
const waitedFor = (party: Party) =>
  Array.from(party.members.values()).filter((m) => connected(m) && !m.away).map((m) => m.publicId);

function setTimer(party: Party, ms: number, run: () => void) {
  if (party.timer) clearTimeout(party.timer);
  party.timer = setTimeout(() => {
    party.timer = null;
    run();
  }, ms);
}

/** Step 1 done (or timed out): the earliest position reported is the target */
function settlePosition(party: Party) {
  const barrier = party.state.barrier;
  if (!barrier || barrier.position !== null) return;
  const positions = Array.from(party.positions.values());
  barrier.position = positions.length ? Math.max(0, Math.min(...positions)) : party.state.position;
  setTimer(party, READY_TIMEOUT_MS, () => closeBarrier(party, barrier.id));
}

/** Step 2 done (or timed out): everyone pauses there, or starts from there together */
function closeBarrier(party: Party, id: number) {
  const barrier = party.state.barrier;
  if (!barrier || barrier.id !== id || barrier.position === null) return;
  if (party.timer) clearTimeout(party.timer);
  party.timer = null;
  party.state = {
    ...party.state,
    barrier: null,
    playing: barrier.resume,
    position: barrier.position,
    at: barrier.resume ? Date.now() + START_DELAY_MS : Date.now(),
  };
  broadcast(party);
}

/** Moves the open barrier along when everyone it waits for has answered */
function advance(party: Party) {
  const barrier = party.state.barrier;
  if (!barrier) return;
  const waiting = waitedFor(party);
  if (barrier.position === null) {
    if (waiting.every((id) => barrier.reported.includes(id))) settlePosition(party);
    else return;
  }
  if (waiting.every((id) => barrier.ready.includes(id))) closeBarrier(party, barrier.id);
}

function openBarrier(party: Party, kind: BarrierKind, by: string, position: number | null, resume: boolean) {
  const barrier: PartyBarrier = { id: ++party.nextBarrier, kind, position, resume, by, reported: [], ready: [] };
  party.positions = new Map();
  // Paused where it is until the barrier closes
  party.state = { ...party.state, barrier, playing: false, position: currentPosition(party.state), at: Date.now() };
  if (position === null) setTimer(party, REPORT_TIMEOUT_MS, () => {
    settlePosition(party);
    advance(party);
    broadcast(party);
  });
  else setTimer(party, kind === "pick" ? PICK_TIMEOUT_MS : READY_TIMEOUT_MS, () => closeBarrier(party, barrier.id));
  return barrier;
}

/** Where playback is now, by the room's clock */
function currentPosition(state: PartyState) {
  return state.playing ? state.position + Math.max(0, Date.now() - state.at) / 1000 : state.position;
}

export function createParty(name: string) {
  sweep();
  if (parties.size >= MAX_PARTIES) return null;
  const now = Date.now();
  const hostId = secret();
  const party: Party = {
    code: newCode(),
    hostId,
    state: { phase: "idle", animeId: null, episode: null, audio: "sub", playing: false, position: 0, at: now, barrier: null },
    members: new Map([[hostId, { publicId: secret().slice(0, 8), name, away: true, listeners: new Set(), touchedAt: now }]]),
    createdAt: now,
    nextBarrier: 0,
    positions: new Map(),
    timer: null,
  };
  parties.set(party.code, party);
  return { party, member: hostId };
}

export function joinParty(party: Party, name: string) {
  if (party.members.size >= MAX_MEMBERS) return null;
  const id = secret();
  party.members.set(id, { publicId: secret().slice(0, 8), name, away: true, listeners: new Set(), touchedAt: Date.now() });
  broadcast(party);
  return id;
}

/** The host picks what to watch: everyone goes there, and it starts at 0:00 once all have it loaded */
export function selectEpisode(party: Party, memberId: string, pick: { animeId: number; episode: number; audio: "sub" | "dub" }) {
  if (memberId !== party.hostId) return "NOT_HOST";
  const host = party.members.get(memberId)!;
  party.state = { ...party.state, ...pick, phase: "watching", position: 0, playing: false };
  openBarrier(party, "pick", host.name, 0, true);
  broadcast(party);
  return "OK";
}

/** The host starts the pick without waiting for the slow ones */
export function startNow(party: Party, memberId: string) {
  if (memberId !== party.hostId) return "NOT_HOST";
  const barrier = party.state.barrier;
  if (barrier?.kind === "pick") closeBarrier(party, barrier.id);
  return "OK";
}

export type PlaybackRequest =
  | { action: "pause"; position: number }
  | { action: "play" }
  | { action: "seek"; position: number }
  | { action: "stall"; position: number };

/**
 * A member asks for a pause (anyone), a resume (anyone), a jump (host only), or reports its
 * player ran out of buffer. Each opens a barrier; a pause asked for during another pause only
 * adds its position.
 */
export function requestPlayback(party: Party, memberId: string, request: PlaybackRequest) {
  const member = party.members.get(memberId);
  if (!member) return "NOT_A_MEMBER";
  member.touchedAt = Date.now();
  if (party.state.phase !== "watching") return "OK";
  const open = party.state.barrier;

  if (request.action === "seek") {
    if (memberId !== party.hostId) return "NOT_HOST";
    const wasPlaying = open ? open.resume : party.state.playing;
    openBarrier(party, "seek", member.name, Math.max(0, request.position), wasPlaying);
  } else if (request.action === "pause" || request.action === "stall") {
    if (open && open.position === null) {
      reportPosition(party, member, open.id, request.position);
      return "OK";
    }
    // Pausing during a resume or a stall cancels the start; a stall keeps playing afterwards
    const resume = request.action === "stall" && (open ? open.resume : party.state.playing);
    const barrier = openBarrier(party, request.action, member.name, null, resume);
    reportPosition(party, member, barrier.id, request.position);
  } else {
    if (open) {
      // Asked to play during a pause's barrier: it resumes when it closes
      if (open.kind !== "pick") open.resume = true;
    } else if (!party.state.playing) {
      openBarrier(party, "resume", member.name, party.state.position, true);
    }
  }
  advance(party);
  broadcast(party);
  return "OK";
}

function reportPosition(party: Party, member: Member, barrierId: number, position: number) {
  const barrier = party.state.barrier;
  if (!barrier || barrier.id !== barrierId || barrier.position !== null) return;
  if (!barrier.reported.includes(member.publicId)) barrier.reported.push(member.publicId);
  if (Number.isFinite(position) && position >= 0) party.positions.set(member.publicId, position);
}

/**
 * A device answers the open barrier: where it stopped (step 1), or that it has the target
 * buffered (step 2). `away` marks a device on another page, which isn't waited for.
 */
export function answerBarrier(
  party: Party,
  memberId: string,
  answer: { barrierId?: number; position?: number; ready?: boolean; away?: boolean }
) {
  const member = party.members.get(memberId);
  if (!member) return false;
  member.touchedAt = Date.now();
  if (typeof answer.away === "boolean" && answer.away !== member.away) member.away = answer.away;
  const barrier = party.state.barrier;
  if (barrier && barrier.id === answer.barrierId) {
    if (typeof answer.position === "number") reportPosition(party, member, barrier.id, answer.position);
    if (answer.ready && barrier.position !== null && !barrier.ready.includes(member.publicId)) barrier.ready.push(member.publicId);
  }
  advance(party);
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
    // Someone who drops out isn't waited for
    advance(party);
    broadcast(party);
  };
}

/** Every open room, for the control panel */
export function listParties() {
  sweep();
  return Array.from(parties.values()).map((party) => ({ ...snapshot(party), createdAt: party.createdAt }));
}

/** Closes a room from the control panel: everyone in it is told, as when the last one leaves */
export function closeParty(code: unknown) {
  const party = findParty(code);
  if (!party) return false;
  if (party.timer) clearTimeout(party.timer);
  parties.delete(party.code);
  party.members.forEach((m) => m.listeners.forEach((l) => l({ type: "closed" })));
  return true;
}

/** Leaves the room; the host hands it to the next member, and the last one closes it */
export function leaveParty(party: Party, memberId: string) {
  const member = party.members.get(memberId);
  if (!member) return;
  party.members.delete(memberId);
  member.listeners.forEach((l) => l({ type: "closed" }));
  if (party.members.size === 0) {
    if (party.timer) clearTimeout(party.timer);
    parties.delete(party.code);
    return;
  }
  if (memberId === party.hostId) {
    const next = Array.from(party.members.entries()).find(([, m]) => connected(m)) ?? Array.from(party.members.entries())[0];
    party.hostId = next[0];
  }
  advance(party);
  broadcast(party);
}
