import { randomBytes } from "node:crypto";
import type { NextRequest } from "next/server";

/**
 * What this server is doing, for the control panel (scripts/panel): video sent through the proxies
 * per device, what each open player is playing (players report it, see /api/now-playing), and how
 * real playback requests to each stream server went. Kept in memory only; it starts empty with
 * every start of the server. Read through /api/internal/stats.
 */

/** Seconds the transfer rate is averaged over */
const RATE_WINDOW_S = 10;
/** A device or player not heard from for this long is dropped */
const FORGET_MS = 10 * 60 * 1000;
const MAX_DEVICES = 200;
const MAX_PLAYERS = 100;

/** Requests the server makes to itself (the health check) carry this header and aren't counted */
export const INTERNAL_HEADER = "x-pk-internal";

interface Device {
  ip: string;
  userAgent: string;
  bytes: number;
  requests: number;
  firstSeen: number;
  lastSeen: number;
  /** Bytes per second over the last RATE_WINDOW_S seconds, one slot per second */
  slots: Map<number, number>;
}

export interface NowPlaying {
  id: string;
  ip: string;
  userAgent: string;
  anilistId: number | null;
  episode: number | null;
  title: string | null;
  server: string | null;
  audio: string | null;
  position: number | null;
  duration: number | null;
  paused: boolean;
  /** In a "Ver juntos" room */
  party: string | null;
  startedAt: number;
  updatedAt: number;
}

interface ServerUse {
  ok: number;
  failed: number;
  lastOkAt: number | null;
  lastError: { at: number; status: number; message: string } | null;
}

interface Stats {
  bootId: string;
  startedAt: number;
  bytes: number;
  requests: number;
  byKind: Record<string, number>;
  slots: Map<number, number>;
  devices: Map<string, Device>;
  players: Map<string, NowPlaying>;
  servers: Map<string, ServerUse>;
}

// One copy for the whole server process, whatever module instance a route got
const g = globalThis as typeof globalThis & { __pkServerStats?: Stats };
const stats: Stats = (g.__pkServerStats ??= {
  bootId: randomBytes(6).toString("hex"),
  startedAt: Date.now(),
  bytes: 0,
  requests: 0,
  byKind: {},
  slots: new Map(),
  devices: new Map(),
  players: new Map(),
  servers: new Map(),
});

/** The visitor's address: the first X-Forwarded-For hop (the panel's front door sets it), else the socket's */
export function clientIp(request: NextRequest | Request) {
  const forwarded = request.headers.get("x-forwarded-for");
  const first = forwarded?.split(",")[0]?.trim();
  const ip = first || request.headers.get("x-real-ip") || (request as NextRequest).ip || "";
  // IPv4 seen through an IPv6 socket
  return ip.replace(/^::ffff:/, "") || "desconocida";
}

const second = () => Math.floor(Date.now() / 1000);

function addToSlots(slots: Map<number, number>, bytes: number) {
  const now = second();
  slots.set(now, (slots.get(now) ?? 0) + bytes);
  for (const key of slots.keys()) if (key <= now - RATE_WINDOW_S) slots.delete(key);
}

function rateOf(slots: Map<number, number>) {
  const now = second();
  let sum = 0;
  // The current second is still filling: the window is the RATE_WINDOW_S full seconds before it
  for (const [key, bytes] of slots) if (key < now && key >= now - RATE_WINDOW_S) sum += bytes;
  return Math.round(sum / RATE_WINDOW_S);
}

function forgetOld<T extends { lastSeen?: number; updatedAt?: number }>(map: Map<string, T>, max: number) {
  const now = Date.now();
  for (const [key, value] of map) {
    if (now - (value.lastSeen ?? value.updatedAt ?? 0) > FORGET_MS) map.delete(key);
  }
  // Still too many: the oldest go first (a Map keeps insertion order)
  while (map.size > max) map.delete(map.keys().next().value as string);
}

/** Bytes sent to the visitor behind `request` ("video", "playlist", "subtitles", "key", "other") */
export function noteTransfer(request: NextRequest | Request, bytes: number, kind: string) {
  if (request.headers.get(INTERNAL_HEADER) || !(bytes > 0)) return;
  stats.bytes += bytes;
  stats.requests += 1;
  stats.byKind[kind] = (stats.byKind[kind] ?? 0) + bytes;
  addToSlots(stats.slots, bytes);

  const ip = clientIp(request);
  const userAgent = request.headers.get("user-agent") || "";
  const key = `${ip} ${userAgent}`;
  let device = stats.devices.get(key);
  if (!device) {
    device = { ip, userAgent, bytes: 0, requests: 0, firstSeen: Date.now(), lastSeen: Date.now(), slots: new Map() };
    stats.devices.set(key, device);
    forgetOld(stats.devices, MAX_DEVICES);
  }
  device.bytes += bytes;
  device.requests += 1;
  device.lastSeen = Date.now();
  addToSlots(device.slots, bytes);
}

/**
 * Wraps a proxy route's GET so what it sends is counted. The size comes from Content-Length, or
 * by counting the body as it streams out when there is none.
 */
export function counted<C>(kind: string, handler: (request: NextRequest, context: C) => Promise<Response>) {
  return async (request: NextRequest, context: C): Promise<Response> => {
    const response = await handler(request, context);
    try {
      if (response.status >= 400 || !response.body || request.headers.get(INTERNAL_HEADER)) return response;
      const length = Number(response.headers.get("content-length"));
      if (length > 0) {
        noteTransfer(request, length, kind);
        return response;
      }
      let total = 0;
      const counter = new TransformStream<Uint8Array, Uint8Array>({
        transform(chunk, controller) {
          total += chunk.byteLength;
          controller.enqueue(chunk);
        },
        flush() {
          noteTransfer(request, total, kind);
        },
      });
      return new Response(response.body.pipeThrough(counter), {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
      });
    } catch {
      return response;
    }
  };
}

/** How a real playback request to `server` went (the health check's own requests aren't counted) */
export function noteServerResult(request: NextRequest | Request, server: string, ok: boolean, status: number, message = "") {
  if (request.headers.get(INTERNAL_HEADER)) return;
  const id = server.toLowerCase();
  const use = stats.servers.get(id) ?? { ok: 0, failed: 0, lastOkAt: null, lastError: null };
  if (ok) {
    use.ok += 1;
    use.lastOkAt = Date.now();
  } else {
    use.failed += 1;
    use.lastError = { at: Date.now(), status, message: message.slice(0, 200) };
  }
  stats.servers.set(id, use);
}

const text = (value: unknown, max = 160) => (typeof value === "string" && value.trim() ? value.trim().slice(0, max) : null);
const number = (value: unknown) => (typeof value === "number" && Number.isFinite(value) ? value : null);

/** A player's report of what it's playing; `stopped` drops it */
export function notePlaying(request: NextRequest | Request, report: Record<string, unknown>) {
  const id = text(report.id, 40);
  if (!id) return;
  if (report.stopped) {
    stats.players.delete(id);
    return;
  }
  const previous = stats.players.get(id);
  const now = Date.now();
  const anilistId = number(report.anilistId);
  const episode = number(report.episode);
  // Another episode in the same tab counts as a new viewing
  const same = previous && previous.anilistId === anilistId && previous.episode === episode;
  stats.players.set(id, {
    id,
    ip: clientIp(request),
    userAgent: request.headers.get("user-agent") || "",
    anilistId,
    episode,
    title: text(report.title),
    server: text(report.server, 40),
    audio: text(report.audio, 8),
    position: number(report.position),
    duration: number(report.duration),
    paused: report.paused === true,
    party: text(report.party, 12),
    startedAt: same ? previous.startedAt : now,
    updatedAt: now,
  });
  forgetOld(stats.players, MAX_PLAYERS);
}

export function statsSnapshot() {
  forgetOld(stats.devices, MAX_DEVICES);
  forgetOld(stats.players, MAX_PLAYERS);
  return {
    bootId: stats.bootId,
    startedAt: stats.startedAt,
    bytes: stats.bytes,
    requests: stats.requests,
    byKind: stats.byKind,
    rate: rateOf(stats.slots),
    devices: Array.from(stats.devices.values()).map(({ slots, ...device }) => ({ ...device, rate: rateOf(slots) })),
    players: Array.from(stats.players.values()),
    servers: Object.fromEntries(stats.servers),
    memory: process.memoryUsage().rss,
  };
}
