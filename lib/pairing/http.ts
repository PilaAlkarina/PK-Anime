import QRCode from "qrcode";
import { NextResponse, type NextRequest } from "next/server";
import type { SessionCookie } from "./store";

// Better Auth's cookies with the default prefix: the session, its cached copy and the OAuth
// account (with the list service tokens), possibly split into numbered chunks
const SESSION_COOKIE = /^(__Secure-)?better-auth\.(session_token|session_data|account_data)(\.\d+)?$/;
// Matches session.cookieCache.maxAge in lib/auth.ts
const SESSION_MAX_AGE = 7 * 24 * 60 * 60;

export function pairJson(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "private, no-store" } });
}

export function isCrossSite(request: NextRequest) {
  const origin = request.headers.get("origin");
  return !!origin && new URL(origin).host !== request.nextUrl.host;
}

export function isSecure(request: NextRequest) {
  return (request.headers.get("x-forwarded-proto") || request.nextUrl.protocol.replace(":", "")) === "https";
}

/** The origin the TV reached the server on, which a phone on the same network can reach too */
export function requestOrigin(request: NextRequest) {
  const host = request.headers.get("x-forwarded-host") || request.headers.get("host") || request.nextUrl.host;
  return `${isSecure(request) ? "https" : "http"}://${host}`;
}

export function linkUrl(request: NextRequest, code: string) {
  return `${requestOrigin(request)}/link?code=${code}`;
}

export function qrSvg(text: string) {
  return QRCode.toString(text, { type: "svg", margin: 1, errorCorrectionLevel: "M" });
}

export function readSessionCookies(request: NextRequest): SessionCookie[] {
  return request.cookies
    .getAll()
    .filter((c) => SESSION_COOKIE.test(c.name))
    .map(({ name, value }) => ({ name, value }));
}

/** Gives the TV the phone's session: the same cookies, so both devices share one sign-in */
export function applySessionCookies(request: NextRequest, res: NextResponse, cookies: SessionCookie[]) {
  const secure = isSecure(request);
  // Chunks left from an earlier session on the TV would corrupt the new one
  for (const old of request.cookies.getAll()) {
    if (SESSION_COOKIE.test(old.name) && !cookies.some((c) => c.name === old.name)) {
      res.cookies.set(old.name, "", { path: "/", maxAge: 0 });
    }
  }
  let applied = 0;
  for (const cookie of cookies) {
    // __Secure- cookies can only be set over HTTPS
    if (cookie.name.startsWith("__Secure-") && !secure) continue;
    res.cookies.set(cookie.name, cookie.value, {
      path: "/",
      httpOnly: true,
      sameSite: "lax",
      secure,
      maxAge: SESSION_MAX_AGE,
    });
    applied++;
  }
  return applied;
}
