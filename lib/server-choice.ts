import { NextRequest } from "next/server";
import { GET as playGet } from "@/app/api/play/route";
import { GET as m3u8Get } from "@/app/api/proxy/m3u8/route";
import { GET as segmentGet } from "@/app/api/proxy/segment/route";
import { GET as tsGet } from "@/app/api/proxy/ts/route";
import {
  serverCodeOf,
  trackFits,
  wantedLanguages,
  type SubtitlePreferences,
} from "@/components/player/player-core/preferred-source";
import {
  detectSubtitleLanguage,
  subtitleLanguageName,
  subtitleVariantRank,
} from "@/components/player/player-core/subtitle-language";
import {
  compareServers,
  couldBeat,
  decidedBy,
  isAvailable,
  type Connection,
  type DecidedBy,
  type RankedServer,
} from "@/lib/server-ranking";
import { INTERNAL_HEADER, SERVER_TAG, upstreamMetrics } from "@/lib/server-stats";
import { serverOrder, STREAM_SERVERS, type StreamServer } from "@/lib/server-settings";
import { getStatus, lastStatus, statusChecking } from "@/lib/status";
import { httpFallbackHosts } from "@/lib/stream-proxy/https-fallback";

/**
 * Picks the stream server for an episode on the server, before the player starts: every server
 * is asked for the episode at once (through /api/play, in this process), and they are ranked by
 * the layers in lib/server-ranking.ts (audio, language, HTTPS, connection, variant, order).
 *
 * The connection comes from real playback (the proxy times every download from each provider),
 * the periodic health check, or, for a server with neither in the last half hour, from fetching
 * its first segment now. The answer comes as soon as no server still answering can beat the best
 * one, or after BUDGET_MS; the rest keep resolving in the background and update the cached result.
 */

const BUDGET_MS = 3000;
const CACHE_MS = 10 * 60 * 1000;
/** Connection data older than this doesn't count, and a server without newer data is measured */
const FRESH_MS = 30 * 60 * 1000;
/** The health check runs again in the background when it's older than this */
const STATUS_EVERY_MS = 15 * 60 * 1000;
const PROBE_TIMEOUT_MS = 6000;

export interface ChoiceRequest {
  anilistId: number | null;
  malId: number | null;
  episode: number;
  audio: "sub" | "dub";
  languages: string[];
  subtitlesEnabled: boolean;
  dubSubtitles: "full" | "forced" | "off";
  preferred: StreamServer | "auto";
}

interface Candidate extends RankedServer {
  server: StreamServer;
  detail?: string;
  play?: Record<string, any>;
  language: string | null;
}

export interface ChoiceResult {
  success: boolean;
  error?: string;
  server?: StreamServer;
  audio?: "sub" | "dub";
  summary?: string;
  reason?: {
    decidedBy: DecidedBy;
    language: string | null;
    variant: number | null;
    https: boolean;
    connection: Connection;
  };
  ranking: Array<{
    server: StreamServer;
    state: "ok" | "unavailable" | "pending" | "down";
    detail?: string;
    language: string | null;
    variant: number | null;
    https: boolean;
    connection: Connection;
  }>;
  play?: Record<string, any>;
  cached?: boolean;
  ms?: number;
}

// ---- connection -------------------------------------------------------------------------------

function knownConnection(server: StreamServer, measured?: { startMs: number }): Connection {
  const now = Date.now();
  const passive = upstreamMetrics(server, FRESH_MS);
  const usable = passive && passive.samples >= 3 ? passive : null;
  const last = lastStatus();
  const check = last && now - last.at < FRESH_MS ? last.report.services.find((s) => s.id === server) : undefined;
  // A failed check only counts while real playback hasn't worked since
  const checkDown = check?.state === "down" && (!passive || passive.lastAt < (last?.at ?? 0));
  const realDown = Boolean(passive && passive.samples >= 4 && passive.errorRate >= 0.5);
  return {
    startMs: measured?.startMs ?? (check && check.state !== "down" ? check.ms : null),
    // Speed only from real playback: one segment fetched now is mostly the wait for its first byte
    throughput: usable?.throughput ?? null,
    degraded: check?.state === "degraded" || Boolean(passive && passive.errorRate >= 0.2),
    down: checkDown || realDown,
    source: measured ? "medido" : usable ? "uso real" : check ? "comprobación" : null,
  };
}

const needsMeasuring = (c: Connection) => c.source === null;

// ---- calling our own routes in this process ---------------------------------------------------

type Handler = (request: NextRequest, context: undefined) => Promise<Response>;

function routeFor(pathname: string): Handler | null {
  if (pathname.startsWith("/api/proxy/m3u8")) return m3u8Get as Handler;
  if (pathname.startsWith("/api/proxy/ts")) return tsGet as Handler;
  if (pathname.startsWith("/api/proxy/segment")) return segmentGet as Handler;
  return null;
}

function tagUrl(url: string, server: string) {
  if (!url || !url.includes("/api/proxy/") || url.includes(`${SERVER_TAG}=`)) return url;
  return `${url}${url.includes("?") ? "&" : "?"}${SERVER_TAG}=${server}`;
}

/** The playback data with every proxied stream URL tagged with its server, for the speed figures */
function tagPlay(play: Record<string, any>, server: StreamServer) {
  const tagged = { ...play };
  for (const key of ["streamUrl", "url", "m3u8", "fullM3u8"]) {
    if (typeof tagged[key] === "string") tagged[key] = tagUrl(tagged[key], server);
  }
  for (const key of ["sources", "allServers"]) {
    if (!Array.isArray(tagged[key])) continue;
    tagged[key] = tagged[key].map((source: any) => {
      const code = serverCodeOf(source);
      if (!code) return source;
      return {
        ...source,
        videoUrl: typeof source.videoUrl === "string" ? tagUrl(source.videoUrl, code) : source.videoUrl,
        m3u8: typeof source.m3u8 === "string" ? tagUrl(source.m3u8, code) : source.m3u8,
      };
    });
  }
  return tagged;
}

/** Whether the provider behind a proxied stream URL is fetched over HTTPS */
function isHttps(streamUrl: string, origin: string) {
  try {
    const upstream = new URL(streamUrl, origin).searchParams.get("url");
    if (!upstream) return true;
    const target = new URL(upstream);
    return target.protocol === "https:" && !httpFallbackHosts().includes(target.host);
  } catch {
    return true;
  }
}

const firstUri = (playlist: string) => playlist.split(/\r?\n/).find((line) => line.trim() && !line.startsWith("#"));

/** Fetches the playlist and the first segment through our proxies, as the player would */
async function measure(streamUrl: string, server: StreamServer, origin: string, headers: Headers) {
  const started = Date.now();
  const deadline = started + PROBE_TIMEOUT_MS;
  const get = async (url: URL) => {
    const handler = routeFor(url.pathname);
    if (!handler || Date.now() > deadline) return null;
    const res = await handler(new NextRequest(url, { headers }), undefined);
    return res.ok ? res : null;
  };
  let url = new URL(tagUrl(streamUrl, server), origin);
  let playlist = await (await get(url))?.text();
  if (!playlist?.startsWith("#EXTM3U")) return null;
  if (playlist.includes("#EXT-X-STREAM-INF")) {
    const variant = firstUri(playlist);
    if (!variant) return null;
    url = new URL(variant, url);
    playlist = await (await get(url))?.text();
    if (!playlist) return null;
  }
  const segment = firstUri(playlist);
  if (!segment) return null;
  const bytes = (await (await get(new URL(segment, url)))?.arrayBuffer())?.byteLength ?? 0;
  if (bytes < 188) return null;
  return { probeMs: Date.now() - started };
}

// ---- one server -------------------------------------------------------------------------------

function tracksFor(play: Record<string, any>, server: StreamServer, audio: "sub" | "dub") {
  const type = audio === "dub" ? "DUB" : "SUB";
  const sources: any[] = Array.isArray(play.sources) ? play.sources : [];
  const own = sources.find((s) => serverCodeOf(s) === server && String(s.type || "").toUpperCase() === type)?.subtitles;
  if (Array.isArray(own) && own.length) return own;
  if (Array.isArray(play.subtitles) && play.subtitles.length) return play.subtitles;
  // A dub without tracks of its own borrows its server's sub tracks (same encode)
  const sub = sources.find((s) => serverCodeOf(s) === server && String(s.type || "").toUpperCase() === "SUB")?.subtitles;
  return Array.isArray(sub) ? sub : [];
}

function languageOf(tracks: any[], audio: "sub" | "dub", prefs: SubtitlePreferences) {
  const languages = wantedLanguages(audio, prefs);
  if (languages.length === 0) return { level: 0, language: null, variant: 0 };
  for (let i = 0; i < languages.length; i++) {
    const fitting = tracks.filter((t) => trackFits(t, audio, prefs) && detectSubtitleLanguage(t) === languages[i]);
    if (fitting.length) {
      return { level: i, language: languages[i], variant: Math.min(...fitting.map((t) => subtitleVariantRank(t))) };
    }
  }
  return { level: Infinity, language: null, variant: Infinity };
}

async function evaluate(
  server: StreamServer,
  ask: ChoiceRequest,
  context: { origin: string; headers: Headers; probeHeaders: Headers; orderIndex: number }
): Promise<Candidate> {
  const started = Date.now();
  const base: Candidate = {
    server,
    state: "unavailable",
    https: true,
    audioMatch: false,
    level: Infinity,
    language: null,
    variant: Infinity,
    connection: knownConnection(server),
    orderIndex: context.orderIndex,
  };
  const params = new URLSearchParams({ episode: String(ask.episode), audio: ask.audio, server });
  if (ask.anilistId) params.set("anilistId", String(ask.anilistId));
  if (ask.malId) params.set("malId", String(ask.malId));

  let play: Record<string, any>;
  try {
    const res = await (playGet as Handler)(
      new NextRequest(new URL(`/api/play?${params}`, context.origin), { headers: context.headers }),
      undefined
    );
    play = await res.json().catch(() => ({}));
    if (!res.ok) return { ...base, detail: String(play?.error || `HTTP ${res.status}`) };
  } catch (err) {
    return { ...base, detail: (err as Error).message };
  }
  // /api/play answers from another server when this one has nothing
  if (!String(play.server || "").toLowerCase().includes(server)) {
    return { ...base, detail: `Sin el episodio (respondió ${play.server || "nadie"})` };
  }
  const stream: string = play.streamUrl || play.m3u8 || play.url || "";
  if (!stream) return { ...base, detail: "Sin enlace de vídeo" };

  const prefs = prefsOf(ask);
  const audioMatch = ask.audio === "sub" || !play.audio_fallback;
  const language = languageOf(tracksFor(play, server, audioMatch ? ask.audio : "sub"), ask.audio, prefs);
  const resolveMs = Date.now() - started;

  let connection = base.connection;
  if (needsMeasuring(connection)) {
    const measured = await measure(stream, server, context.origin, context.probeHeaders).catch(() => null);
    if (measured) {
      connection = knownConnection(server, { startMs: resolveMs + measured.probeMs });
    }
  }

  return {
    ...base,
    state: "ok",
    play,
    https: isHttps(stream, context.origin),
    audioMatch,
    ...language,
    connection,
  };
}

// ---- describing the choice --------------------------------------------------------------------

const compare = compareServers;

const prefsOf = (ask: ChoiceRequest): SubtitlePreferences => ({
  subtitlesEnabled: ask.subtitlesEnabled,
  subtitleLanguages: ask.languages,
  dubSubtitles: ask.dubSubtitles,
  switchServerForSubtitles: true,
  preferredServer: ask.preferred,
});

const number = (n: number, digits = 1) => n.toLocaleString("es-ES", { maximumFractionDigits: digits });

function connectionText(c: Connection) {
  if (c.throughput !== null) return `${number(c.throughput / 1e6)} MB/s`;
  if (c.startMs !== null) return `${number(c.startMs / 1000)} s`;
  return "";
}

function summaryOf(winner: Candidate, ask: ChoiceRequest) {
  const parts: string[] = [];
  if (!winner.audioMatch) parts.push("sin doblaje, en japonés");
  if (!ask.subtitlesEnabled) parts.push("subtítulos desactivados");
  else if (winner.language) {
    const variant = winner.variant === 0 && winner.language === "es" ? " de España" : winner.variant === 2 ? " latino" : "";
    parts.push(`${subtitleLanguageName(winner.language).toLowerCase()}${variant}`);
  } else if (winner.level === Infinity) parts.push("sin tus idiomas");
  if (!winner.https) parts.push("sin HTTPS");
  const speed = connectionText(winner.connection);
  if (speed) parts.push(speed);
  return parts.join(" · ");
}

function buildResult(candidates: Candidate[], ask: ChoiceRequest): ChoiceResult {
  const ranked = [...candidates].sort(compare);
  const ranking = ranked.map((c) => ({
    server: c.server,
    state: (c.state === "ok" && c.connection.down ? "down" : c.state) as ChoiceResult["ranking"][number]["state"],
    detail: c.detail,
    language: c.language,
    variant: Number.isFinite(c.variant) ? c.variant : null,
    https: c.https,
    connection: c.connection,
  }));
  const winner = ranked[0];
  if (!winner || !isAvailable(winner)) {
    return { success: false, error: "Ningún servidor tiene este episodio ahora mismo", ranking };
  }
  return {
    success: true,
    server: winner.server,
    audio: winner.audioMatch ? ask.audio : "sub",
    summary: summaryOf(winner, ask),
    reason: {
      decidedBy: decidedBy(winner, ranked[1]),
      language: winner.language,
      variant: Number.isFinite(winner.variant) ? winner.variant : null,
      https: winner.https,
      connection: winner.connection,
    },
    ranking,
    play: tagPlay(winner.play ?? {}, winner.server),
  };
}

// ---- the choice, cached -----------------------------------------------------------------------

interface Entry {
  at: number;
  result: Promise<ChoiceResult>;
  latest: ChoiceResult | null;
}

const g = globalThis as typeof globalThis & { __pkServerChoices?: Map<string, Entry> };
const cache = (g.__pkServerChoices ??= new Map<string, Entry>());

function keyOf(ask: ChoiceRequest) {
  return [
    ask.anilistId,
    ask.malId,
    ask.episode,
    ask.audio,
    ask.subtitlesEnabled ? ask.languages.join(",") : "-",
    ask.dubSubtitles,
    ask.preferred,
  ].join("|");
}

function sweep() {
  const now = Date.now();
  for (const [key, entry] of cache) if (now - entry.at > CACHE_MS) cache.delete(key);
}

/** The health check, run again in the background now and then while people are watching */
function keepStatusFresh(origin: string) {
  const last = lastStatus();
  if ((!last || Date.now() - last.at > STATUS_EVERY_MS) && !statusChecking()) {
    getStatus(origin).catch(() => {});
  }
}

async function run(ask: ChoiceRequest, request: NextRequest, entry: Entry): Promise<ChoiceResult> {
  const origin = request.nextUrl.origin;
  // /api/play builds absolute links from the visitor's host, so it gets the visitor's headers
  const headers = new Headers();
  for (const name of ["host", "x-forwarded-proto", "x-forwarded-host", "x-forwarded-for", "user-agent", "cookie"]) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }
  const probeHeaders = new Headers(headers);
  probeHeaders.set(INTERNAL_HEADER, "choice");

  const base = serverOrder();
  const order = [...new Set([...(ask.preferred !== "auto" ? [ask.preferred] : []), ...base, ...STREAM_SERVERS])];
  const candidates = new Map<StreamServer, Candidate>();
  const pending = new Map<StreamServer, Promise<void>>();

  order.forEach((server, orderIndex) => {
    candidates.set(server, {
      server,
      state: "pending",
      https: true,
      audioMatch: false,
      level: Infinity,
      language: null,
      variant: Infinity,
      connection: knownConnection(server),
      orderIndex,
    });
    const task = evaluate(server, ask, { origin, headers, probeHeaders, orderIndex })
      .catch((err): Candidate => ({ ...candidates.get(server)!, state: "unavailable", detail: (err as Error).message }))
      .then((candidate) => {
        candidates.set(server, candidate);
        pending.delete(server);
        // Late answers still improve the cached result for whoever asks next
        if (entry.latest) entry.latest = buildResult([...candidates.values()], ask);
      });
    pending.set(server, task);
  });

  const languagesMatter = wantedLanguages(ask.audio, prefsOf(ask)).length > 0;
  const deadline = Date.now() + BUDGET_MS;
  for (;;) {
    const best = [...candidates.values()].filter((c) => c.state !== "pending").sort(compare)[0];
    const settled =
      pending.size === 0 ||
      (best && isAvailable(best) && [...pending.keys()].every((s) => !couldBeat(candidates.get(s)!, best, languagesMatter)));
    const left = deadline - Date.now();
    if (settled || left <= 0) break;
    await Promise.race([...pending.values(), new Promise((resolve) => setTimeout(resolve, left))]);
  }

  const result = buildResult([...candidates.values()], ask);
  entry.latest = result;
  return result;
}

/** The server to play `ask` from, with the reason and the others ranked as fallbacks */
export async function chooseServer(ask: ChoiceRequest, request: NextRequest): Promise<ChoiceResult> {
  sweep();
  keepStatusFresh(request.nextUrl.origin);
  const started = Date.now();
  const key = keyOf(ask);
  const existing = cache.get(key);
  if (existing) {
    const result = existing.latest ?? (await existing.result);
    // A failed choice isn't kept: the next viewer asks again
    if (!result.success && existing.latest) cache.delete(key);
    return { ...result, cached: true, ms: Date.now() - started };
  }
  const entry: Entry = { at: Date.now(), result: Promise.resolve(null as unknown as ChoiceResult), latest: null };
  entry.result = run(ask, request, entry);
  cache.set(key, entry);
  try {
    const result = await entry.result;
    if (!result.success) cache.delete(key);
    return { ...result, cached: false, ms: Date.now() - started };
  } catch (err) {
    cache.delete(key);
    throw err;
  }
}
