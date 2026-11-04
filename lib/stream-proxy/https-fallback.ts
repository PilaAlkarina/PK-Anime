/**
 * Some stream CDNs answer on port 80 but refuse or drop HTTPS connections (seen on Megaplay's
 * segment hosts, used by Yuri, Zuri and Buzz). These requests are made by our server, never by
 * the browser, so when an https:// upstream can't even be connected to, the proxy retries the
 * same URL over http:// and remembers the host for a while, so later segments skip the failed
 * TLS connect (about 2 s each).
 *
 * Only connection-level failures fall back: an HTTP error status or a bad payload is the
 * upstream's real answer and is passed on as before.
 */

const REMEMBER_MS = 10 * 60 * 1000;
const MAX_HOSTS = 200;

const CONNECT_ERRORS = new Set([
  "ECONNREFUSED",
  "ECONNRESET",
  "EHOSTUNREACH",
  "ENETUNREACH",
  "ETIMEDOUT",
  "ECONNABORTED",
  "EPROTO",
  "ERR_SSL_WRONG_VERSION_NUMBER",
  "ERR_TLS_CERT_ALTNAME_INVALID",
  "UNABLE_TO_VERIFY_LEAF_SIGNATURE",
  "CERT_HAS_EXPIRED",
  "DEPTH_ZERO_SELF_SIGNED_CERT",
  "SELF_SIGNED_CERT_IN_CHAIN",
]);

// Host → time until which it is fetched over http directly. Kept on globalThis because Next
// bundles each route on its own: the segment and playlist proxies and /api/status would
// otherwise each see a separate, empty map.
const globalStore = globalThis as typeof globalThis & { __pkHttpOnlyHosts?: Map<string, number> };
const httpOnlyHosts = (globalStore.__pkHttpOnlyHosts ??= new Map<string, number>());

function hostOf(url: string) {
  try {
    return new URL(url).host;
  } catch {
    return null;
  }
}

function isHttpOnly(host: string) {
  const until = httpOnlyHosts.get(host);
  if (!until) return false;
  if (Date.now() > until) {
    httpOnlyHosts.delete(host);
    return false;
  }
  return true;
}

function rememberHttpOnly(host: string) {
  if (httpOnlyHosts.size >= MAX_HOSTS) {
    const oldest = httpOnlyHosts.keys().next().value;
    if (oldest) httpOnlyHosts.delete(oldest);
  }
  httpOnlyHosts.set(host, Date.now() + REMEMBER_MS);
}

const toHttp = (url: string) => url.replace(/^https:\/\//i, "http://");

/** True for errors where no HTTP response arrived at all (refused, reset, TLS failure) */
export function isConnectionError(err: unknown): boolean {
  const e = err as { code?: string; cause?: { code?: string }; response?: unknown } | null;
  if (!e || e.response) return false;
  const code = e.code || e.cause?.code;
  return !!code && CONNECT_ERRORS.has(code);
}

/**
 * Runs `request` against the URL, over http right away for hosts known to refuse https, or
 * after a connection-level https failure. The fallback is remembered per host.
 */
export async function withHttpsFallback<T>(url: string, request: (url: string) => Promise<T>): Promise<T> {
  const host = hostOf(url);
  const secure = /^https:\/\//i.test(url);
  if (!secure || !host) return request(url);
  if (isHttpOnly(host)) return request(toHttp(url));

  try {
    return await request(url);
  } catch (err) {
    if (!isConnectionError(err)) throw err;
    const result = await request(toHttp(url));
    rememberHttpOnly(host);
    console.warn(`[stream-proxy] ${host} refuses HTTPS; using HTTP for the next ${REMEMBER_MS / 60000} min`);
    return result;
  }
}

/** Hosts currently served over http, for the status endpoint */
export function httpFallbackHosts(): string[] {
  return Array.from(httpOnlyHosts.keys()).filter(isHttpOnly);
}
