import { randomBytes, randomInt } from "crypto";

/**
 * Phone ↔ TV links, kept in this server process's memory. Fine for a single self-hosted
 * instance; several instances (or serverless) would need a shared store such as Redis.
 * Restarting the server drops every link, and TVs then offer to pair again.
 *
 * A link starts pending with a short code (shown on the TV as a QR) and is claimed by the
 * phone that opens it. The TV then holds `tvToken` and the phone `controllerToken`; neither
 * leaves the device that received it.
 */

export const REMOTE_KEYS = [
  "ArrowUp",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
  "Enter",
  "Back",
  "PlayPause",
  "FastForward",
  "Rewind",
] as const;
export type RemoteKey = (typeof REMOTE_KEYS)[number];

export const REMOTE_DESTINATIONS = ["/", "/search", "/schedule", "/genres", "/my-list", "/account", "/settings"];

export type RemoteCommand =
  | { kind: "key"; key: RemoteKey }
  | { kind: "text"; text: string }
  | { kind: "navigate"; href: string }
  | { kind: "signout" };

export type LinkEvent =
  | { type: "linked" }
  | { type: "unlinked" }
  | { type: "command"; command: RemoteCommand }
  /** The phone handed over its session; the TV fetches it from /api/pair/session/accept */
  | { type: "session"; name: string };

export interface SessionCookie {
  name: string;
  value: string;
}

interface Link {
  tvToken: string;
  code: string | null;
  controllerToken: string | null;
  createdAt: number;
  touchedAt: number;
  pendingSession: SessionCookie[] | null;
  listeners: Set<(event: LinkEvent) => void>;
}

const PENDING_TTL = 10 * 60 * 1000;
const IDLE_TTL = 24 * 60 * 60 * 1000;
const MAX_LINKS = 200;
// No 0/O or 1/I, so a code typed by hand is hard to get wrong
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const CODE_LENGTH = 6;

// On globalThis so dev-mode module reloads keep the links
const g = globalThis as typeof globalThis & { __pkTvLinks?: Map<string, Link> };
const links = (g.__pkTvLinks ??= new Map<string, Link>());

const token = () => randomBytes(24).toString("base64url");

function expiresAt(link: Link) {
  return link.controllerToken ? link.touchedAt + IDLE_TTL : link.createdAt + PENDING_TTL;
}

function sweep() {
  const now = Date.now();
  for (const [key, link] of links) {
    // A TV that is still listening keeps its link
    if (now > expiresAt(link) && link.listeners.size === 0) links.delete(key);
  }
}

function newCode() {
  for (;;) {
    let code = "";
    for (let i = 0; i < CODE_LENGTH; i++) code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
    if (!findByCode(code)) return code;
  }
}

export function createLink() {
  sweep();
  if (links.size >= MAX_LINKS) return null;
  const now = Date.now();
  const link: Link = {
    tvToken: token(),
    code: newCode(),
    controllerToken: null,
    createdAt: now,
    touchedAt: now,
    pendingSession: null,
    listeners: new Set(),
  };
  links.set(link.tvToken, link);
  return link;
}

export function findByTv(tvToken: unknown) {
  if (typeof tvToken !== "string") return null;
  const link = links.get(tvToken);
  return link && (Date.now() <= expiresAt(link) || link.listeners.size > 0) ? link : null;
}

export function findByCode(code: unknown) {
  if (typeof code !== "string") return null;
  const normalized = code.toUpperCase().replace(/[^A-Z0-9]/g, "");
  for (const link of links.values()) {
    if (link.code === normalized && Date.now() <= expiresAt(link)) return link;
  }
  return null;
}

export function findByController(controllerToken: unknown) {
  if (typeof controllerToken !== "string" || !controllerToken) return null;
  for (const link of links.values()) {
    if (link.controllerToken === controllerToken) return link;
  }
  return null;
}

export function linkState(link: Link) {
  return {
    status: link.controllerToken ? ("linked" as const) : ("pending" as const),
    code: link.code,
    expiresAt: expiresAt(link),
  };
}

/** The phone takes over a pending link; the code stops working */
export function claimLink(link: Link) {
  link.controllerToken = token();
  link.code = null;
  touch(link);
  emit(link, { type: "linked" });
  return link.controllerToken;
}

export function unlink(link: Link) {
  emit(link, { type: "unlinked" });
  links.delete(link.tvToken);
}

export function touch(link: Link) {
  link.touchedAt = Date.now();
}

export function emit(link: Link, event: LinkEvent) {
  link.listeners.forEach((listener) => listener(event));
}

export function subscribe(link: Link, listener: (event: LinkEvent) => void) {
  link.listeners.add(listener);
  return () => link.listeners.delete(listener);
}

export function offerSession(link: Link, cookies: SessionCookie[], name: string) {
  link.pendingSession = cookies;
  touch(link);
  emit(link, { type: "session", name });
}

export function takeSession(link: Link) {
  const cookies = link.pendingSession;
  link.pendingSession = null;
  return cookies;
}
