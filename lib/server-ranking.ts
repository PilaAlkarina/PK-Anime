/**
 * The rules that rank stream servers for an episode (used by lib/server-choice.ts). Pure, with no
 * imports, so they can be checked on their own. Layers, each deciding only when the ones above tie:
 *
 * 1. Has the episode in the wanted audio and isn't down.
 * 2. Audio: the one asked for over a fallback to Japanese.
 * 3. Subtitle language: the viewer's first language, then the second… (always decides).
 * 4. HTTPS: within the same language, servers fetched over HTTPS first. A server only reachable
 *    over HTTP still wins when it's the only one with the language.
 * 5. Connection, when one is clearly better (see `clearlyBetter`): it also overrides the
 *    language variant, but never the language.
 * 6. Variant of the language: Spain, then no region, then Latin American.
 * 7. Order: the viewer's preferred server, then the order set in the control panel.
 */

export interface Connection {
  /** Time to the first segment, ms (from asking for the episode to having video) */
  startMs: number | null;
  /** Bytes per second from the provider */
  throughput: number | null;
  degraded: boolean;
  down: boolean;
  /** Where the figures come from */
  source: "medido" | "uso real" | "comprobación" | null;
}

export interface RankedServer {
  state: "ok" | "unavailable" | "pending";
  https: boolean;
  /** The audio asked for, not a fallback to Japanese */
  audioMatch: boolean;
  /** Index of the first wanted language it has subtitles in; Infinity for none */
  level: number;
  /** 0 Spain, 1 no region, 2 Latin American; Infinity without the language */
  variant: number;
  connection: Connection;
  orderIndex: number;
}

export type DecidedBy = "único" | "audio" | "idioma" | "variante" | "seguridad" | "conexión" | "orden";

/** Rough bytes per second of a 1080p episode: below 1.5 times this a server can't keep up */
export const TYPICAL_BITRATE = 750_000;
const TOO_SLOW = 1.5 * TYPICAL_BITRATE;

const tooSlow = (c: Connection) => c.throughput !== null && c.throughput < TOO_SLOW;

/**
 * Whether `a` connects clearly better than `b`, enough to beat the language variant or the
 * order: `b` is down or slow by the checks, too slow for the video, or takes twice as long (and
 * at least 1.5 s more) to start.
 */
export function clearlyBetter(a: Connection, b: Connection) {
  if (!a.down && b.down) return true;
  if (!a.degraded && b.degraded) return true;
  if (a.throughput !== null && b.throughput !== null && !tooSlow(a) && tooSlow(b)) return true;
  if (a.startMs !== null && b.startMs !== null && b.startMs >= 2 * a.startMs && b.startMs - a.startMs >= 1500) {
    return true;
  }
  return false;
}

export const isAvailable = (c: RankedServer) => c.state === "ok" && !c.connection.down;

/** Sort order: the better server first */
export function compareServers(a: RankedServer, b: RankedServer) {
  const availA = isAvailable(a);
  const availB = isAvailable(b);
  if (availA !== availB) return availA ? -1 : 1;
  if (!availA) {
    // Unchecked ones before the ones known to be missing, each in order
    if (a.state !== b.state) return a.state === "pending" ? -1 : b.state === "pending" ? 1 : 0;
    return a.orderIndex - b.orderIndex;
  }
  if (a.audioMatch !== b.audioMatch) return a.audioMatch ? -1 : 1;
  if (a.level !== b.level) return a.level < b.level ? -1 : 1;
  if (a.https !== b.https) return a.https ? -1 : 1;
  if (clearlyBetter(a.connection, b.connection)) return -1;
  if (clearlyBetter(b.connection, a.connection)) return 1;
  if (a.variant !== b.variant) return a.variant < b.variant ? -1 : 1;
  return a.orderIndex - b.orderIndex;
}

/** The layer that put `winner` ahead of the next one */
export function decidedBy(winner: RankedServer, runnerUp: RankedServer | undefined): DecidedBy {
  if (!runnerUp || !isAvailable(runnerUp)) return "único";
  if (winner.audioMatch !== runnerUp.audioMatch) return "audio";
  if (winner.level !== runnerUp.level) return "idioma";
  if (winner.https !== runnerUp.https) return "seguridad";
  if (clearlyBetter(winner.connection, runnerUp.connection)) return "conexión";
  if (winner.variant !== runnerUp.variant) return "variante";
  return "orden";
}

/**
 * Whether a server still answering could end up ahead of `best`: anything could while `best`
 * lacks the asked audio, HTTPS or the best language variant; otherwise only one earlier in the
 * order, or one known to connect clearly better.
 */
export function couldBeat(pending: RankedServer, best: RankedServer, languagesMatter: boolean) {
  if (!best.audioMatch || !best.https) return true;
  if (languagesMatter && (best.level > 0 || best.variant > 0)) return true;
  if (pending.orderIndex < best.orderIndex) return true;
  return clearlyBetter(pending.connection, best.connection);
}
