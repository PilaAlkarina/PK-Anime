import { httpFallbackHosts } from "@/lib/stream-proxy/https-fallback";
import { INTERNAL_HEADER } from "@/lib/server-stats";

/**
 * Live health of the services the player depends on. Each stream server is checked the way the
 * player uses it: /api/play for a reference episode, then its playlist (and variant), then the
 * first video segment, all through our own proxies. Results are cached for a few minutes so
 * opening the status page never hammers the providers.
 */

export type ServiceState = "ok" | "degraded" | "down";

export interface ServiceStatus {
  id: string;
  name: string;
  kind: "server" | "data";
  state: ServiceState;
  /** Total time of the check, ms */
  ms: number;
  /** Step that failed or was slow: "play", "playlist", "variant", "segment", "request" */
  step?: string;
  detail?: string;
}

export interface StatusReport {
  checkedAt: string;
  services: ServiceStatus[];
  /** Stream hosts currently fetched over HTTP because they refuse HTTPS */
  httpFallbackHosts: string[];
}

// Attack on Titan, episode 1: long-lived and carried by every provider, sub and dub
const REFERENCE = { anilistId: 16498, malId: 16498, episode: 1 };
const SERVERS = [
  { id: "flow", name: "Flow" },
  { id: "kitty", name: "Kitty" },
  { id: "yuri", name: "Yuri" },
  { id: "zuri", name: "Zuri" },
  { id: "buzz", name: "Buzz" },
];

const CACHE_MS = 5 * 60 * 1000;
/** A forced re-check is ignored if the last one is this recent */
const MIN_REFRESH_MS = 60 * 1000;
const STEP_TIMEOUT_MS = 20_000;
/** Working but slower than this end to end counts as degraded */
const SLOW_MS = 8_000;

let cached: { report: StatusReport; at: number } | null = null;
let inFlight: Promise<StatusReport> | null = null;

class StepError extends Error {
  constructor(public step: string, message: string) {
    super(message);
  }
}

async function get(url: string, step: string) {
  let res: Response;
  try {
    // Marked as the server's own, so the control panel doesn't count it as someone watching
    res = await fetch(url, { cache: "no-store", headers: { [INTERNAL_HEADER]: "status" }, signal: AbortSignal.timeout(STEP_TIMEOUT_MS) });
  } catch (err) {
    const e = err as { name?: string; cause?: { code?: string } };
    throw new StepError(step, e.name === "TimeoutError" ? "No responde (tiempo agotado)" : e.cause?.code || "Sin conexión");
  }
  if (!res.ok) {
    let message = `HTTP ${res.status}`;
    try {
      const body = await res.clone().json();
      if (body?.error) message += ` · ${String(body.error).slice(0, 120)}`;
    } catch {}
    throw new StepError(step, message);
  }
  return res;
}

const firstUri = (playlist: string) => playlist.split(/\r?\n/).find((line) => line.trim() && !line.startsWith("#"));

async function checkServer(origin: string, server: { id: string; name: string }): Promise<ServiceStatus> {
  const started = Date.now();
  const base = { id: server.id, name: server.name, kind: "server" as const };
  try {
    const params = new URLSearchParams({
      anilistId: String(REFERENCE.anilistId),
      malId: String(REFERENCE.malId),
      episode: String(REFERENCE.episode),
      audio: "sub",
      server: server.id,
    });
    const play = await (await get(`${origin}/api/play?${params}`, "play")).json();
    // The API answers from another server when this one has nothing: that is a failure here
    if (!String(play?.server || "").toLowerCase().includes(server.id)) {
      throw new StepError("play", `Sin stream propio (respondió ${play?.server || "nadie"})`);
    }
    const stream = play.streamUrl || play.m3u8 || play.url;
    if (!stream) throw new StepError("play", "Sin enlace de stream");

    let url = new URL(stream, origin).toString();
    let playlist = await (await get(url, "playlist")).text();
    if (!playlist.startsWith("#EXTM3U")) throw new StepError("playlist", "La lista no es un .m3u8");
    if (playlist.includes("#EXT-X-STREAM-INF")) {
      const variant = firstUri(playlist);
      if (!variant) throw new StepError("variant", "Lista de calidades vacía");
      url = new URL(variant, url).toString();
      playlist = await (await get(url, "variant")).text();
    }
    const segment = firstUri(playlist);
    if (!segment) throw new StepError("segment", "Lista sin segmentos");
    const bytes = (await (await get(new URL(segment, url).toString(), "segment")).arrayBuffer()).byteLength;
    if (bytes < 188) throw new StepError("segment", "Segmento vacío");

    const ms = Date.now() - started;
    return ms > SLOW_MS
      ? { ...base, state: "degraded", ms, step: "segment", detail: `Lento: ${(ms / 1000).toFixed(1)} s hasta el primer segmento` }
      : { ...base, state: "ok", ms };
  } catch (err) {
    const step = err instanceof StepError ? err.step : "play";
    return { ...base, state: "down", ms: Date.now() - started, step, detail: (err as Error).message };
  }
}

async function checkUrl(
  id: string,
  name: string,
  request: () => Promise<Response>,
  okStatuses: number[] = [200]
): Promise<ServiceStatus> {
  const started = Date.now();
  try {
    const res = await request();
    const ms = Date.now() - started;
    if (!okStatuses.includes(res.status)) {
      return { id, name, kind: "data", state: "down", ms, step: "request", detail: `HTTP ${res.status}` };
    }
    return ms > SLOW_MS
      ? { id, name, kind: "data", state: "degraded", ms, detail: `Lento: ${(ms / 1000).toFixed(1)} s` }
      : { id, name, kind: "data", state: "ok", ms };
  } catch (err) {
    const e = err as { name?: string; cause?: { code?: string } };
    return {
      id,
      name,
      kind: "data",
      state: "down",
      ms: Date.now() - started,
      step: "request",
      detail: e.name === "TimeoutError" ? "No responde (tiempo agotado)" : e.cause?.code || "Sin conexión",
    };
  }
}

async function runChecks(origin: string): Promise<StatusReport> {
  const timeout = () => AbortSignal.timeout(STEP_TIMEOUT_MS);
  const services = await Promise.all([
    checkUrl("anilist", "AniList (catálogo)", () =>
      fetch("https://graphql.anilist.co", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ query: "query { Media(id: 1) { id } }" }),
        cache: "no-store",
        signal: timeout(),
      })
    ),
    // 404 only means AniSkip has no times for that episode; the service answered
    checkUrl(
      "aniskip",
      "AniSkip (saltar intros)",
      () =>
        fetch(
          `https://api.aniskip.com/v2/skip-times/${REFERENCE.malId}/${REFERENCE.episode}?types[]=op&types[]=ed&episodeLength=0`,
          { cache: "no-store", signal: timeout() }
        ),
      [200, 404]
    ),
    ...SERVERS.map((server) => checkServer(origin, server)),
  ]);
  return { checkedAt: new Date().toISOString(), services, httpFallbackHosts: httpFallbackHosts() };
}

/** The last report without running a check, or null: for indicators shown on every page */
export function peekStatus(): (StatusReport & { cached: true }) | null {
  if (!cached || Date.now() - cached.at > CACHE_MS) return null;
  return { ...cached.report, httpFallbackHosts: httpFallbackHosts(), cached: true };
}

/** The cached report, re-checked when older than a few minutes or when `force` is set */
export async function getStatus(origin: string, { force = false } = {}): Promise<StatusReport & { cached: boolean }> {
  const age = cached ? Date.now() - cached.at : Infinity;
  const fresh = age < (force ? MIN_REFRESH_MS : CACHE_MS);
  if (cached && fresh) return { ...cached.report, httpFallbackHosts: httpFallbackHosts(), cached: true };

  inFlight ??= runChecks(origin)
    .then((report) => {
      cached = { report, at: Date.now() };
      return report;
    })
    .finally(() => {
      inFlight = null;
    });
  return { ...(await inFlight), cached: false };
}
