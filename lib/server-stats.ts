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
/**
 * Set by the segment proxies on an answer that didn't come from the provider: one from their own
 * cache ("hit"), or an ad segment refused ("blocked"). Neither counts for the provider's speed.
 */
export const CACHE_HIT_HEADER = "x-pk-cache";
/**
 * Which stream server a proxied URL belongs to ("flow", "kitty"…). The server choice puts it on the
 * playlist it hands out, and `counted` copies it onto every URL inside each playlist, so the
 * segments carry it and their downloads are measured per server.
 */
export const SERVER_TAG = "pks";
/** Provider downloads kept per server, and how far back they count for its speed */
const UPSTREAM_SAMPLES = 120;
const UPSTREAM_WINDOW_MS = 2 * 60 * 60 * 1000;

interface UpstreamSample {
  at: number;
  ms: number;
  bytes: number;
  ok: boolean;
}

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
  /** Why the server choice picked this server ("español de España · 1,2 s") */
  choice: string | null;
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
  upstream: Map<string, UpstreamSample[]>;
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
  upstream: new Map(),
});
// A server started before the upstream map existed (hot reload in development)
stats.upstream ??= new Map();

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

/** A download from a provider: how long it took and how much came, or that it failed */
export function noteUpstream(server: string, ms: number, bytes: number, ok: boolean) {
  const id = server.toLowerCase();
  const samples = stats.upstream.get(id) ?? [];
  samples.push({ at: Date.now(), ms, bytes, ok });
  if (samples.length > UPSTREAM_SAMPLES) samples.splice(0, samples.length - UPSTREAM_SAMPLES);
  stats.upstream.set(id, samples);
}

export interface UpstreamMetrics {
  /** Downloads measured in the window */
  samples: number;
  /** Bytes per second while downloading from the provider */
  throughput: number | null;
  /** Median time of one segment download, ms */
  segmentMs: number | null;
  /** Share of failed downloads, 0–1 */
  errorRate: number;
  lastAt: number;
}

/** How a server's provider has been answering lately, from real playback; null without data */
export function upstreamMetrics(server: string, windowMs = UPSTREAM_WINDOW_MS): UpstreamMetrics | null {
  const since = Date.now() - windowMs;
  const samples = (stats.upstream.get(server.toLowerCase()) ?? []).filter((s) => s.at >= since);
  if (samples.length === 0) return null;
  const ok = samples.filter((s) => s.ok && s.ms > 0);
  const bytes = ok.reduce((sum, s) => sum + s.bytes, 0);
  const ms = ok.reduce((sum, s) => sum + s.ms, 0);
  const times = ok.map((s) => s.ms).sort((a, b) => a - b);
  return {
    samples: samples.length,
    throughput: ms > 0 ? Math.round((bytes / ms) * 1000) : null,
    segmentMs: times.length ? times[Math.floor(times.length / 2)] : null,
    errorRate: 1 - ok.length / samples.length,
    lastAt: samples[samples.length - 1].at,
  };
}

/** Adds the server tag to every proxy URL in a playlist (lines and URI="…" attributes) */
function tagPlaylist(text: string, server: string) {
  return text.replace(/\/api\/proxy\/[a-z0-9]+\?[^"\s]*/g, (url) =>
    url.includes(`${SERVER_TAG}=`) ? url : `${url}&${SERVER_TAG}=${encodeURIComponent(server)}`
  );
}

/**
 * Wraps a proxy route's GET so what it sends is counted. The size comes from Content-Length, or
 * by counting the body as it streams out when there is none. With the server tag, a playlist
 * passes the tag on to its URLs, and a segment's download from the provider is timed.
 */
export function counted<C>(kind: string, handler: (request: NextRequest, context: C) => Promise<Response>) {
  return async (request: NextRequest, context: C): Promise<Response> => {
    const started = Date.now();
    let response = await handler(request, context);
    try {
      const tag = request.nextUrl.searchParams.get(SERVER_TAG)?.toLowerCase().replace(/[^a-z]/g, "").slice(0, 12);
      // Answers from the proxy's cache and ad segments it refuses say nothing of the provider
      if (tag && kind === "video" && !response.headers.get(CACHE_HIT_HEADER)) {
        if (response.status >= 400) noteUpstream(tag, Date.now() - started, 0, false);
        else noteUpstream(tag, Date.now() - started, Number(response.headers.get("content-length")) || 0, true);
      }
      if (tag && kind === "playlist" && response.status < 400 && response.body) {
        const headers = new Headers(response.headers);
        headers.delete("content-length");
        response = new Response(tagPlaylist(await response.text(), tag), {
          status: response.status,
          statusText: response.statusText,
          headers,
        });
      }

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
    choice: text(report.choice, 80),
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
    servers: Object.fromEntries(
      ["flow", "kitty", "yuri", "zuri", "buzz"].map((id) => [
        id,
        { ...(stats.servers.get(id) ?? { ok: 0, failed: 0, lastOkAt: null, lastError: null }), upstream: upstreamMetrics(id) },
      ])
    ),
    memory: process.memoryUsage().rss,
  };
}
