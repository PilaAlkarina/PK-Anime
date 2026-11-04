import type { NextRequest } from "next/server";

/**
 * Where the client reached the server. Next builds request.nextUrl from its own bind address
 * (localhost:3000 under `next dev` and `next start`), not from the Host header, so a TV or
 * phone on the LAN (192.168.1.50:3000, pc.nord:3000…) would look like another site.
 */
export function requestHost(request: NextRequest) {
  const forwarded = request.headers.get("x-forwarded-host")?.split(",")[0].trim();
  return forwarded || request.headers.get("host") || request.nextUrl.host;
}

export function isSecure(request: NextRequest) {
  const forwarded = request.headers.get("x-forwarded-proto")?.split(",")[0].trim();
  return (forwarded || request.nextUrl.protocol.replace(":", "")) === "https";
}

/** The origin the client used, which other devices on the same network can reach too */
export function requestOrigin(request: NextRequest) {
  return `${isSecure(request) ? "https" : "http"}://${requestHost(request)}`;
}

/**
 * True for a browser request sent from another site's page. Cookie-authenticated writes
 * reject those on top of the SameSite=Lax cookies. A browser can't forge Host, and a page on
 * another site can't send X-Forwarded-Host either (custom headers need CORS, which these
 * routes don't allow).
 */
export function isCrossSite(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  try {
    return new URL(origin).host !== requestHost(request);
  } catch {
    return true;
  }
}
