import { NextResponse, type NextRequest } from "next/server";
import { isUiMode, UI_MODE_COOKIE, UI_MODE_PARAM } from "@/lib/ui-mode";

const ONE_YEAR = 60 * 60 * 24 * 365;

/**
 * `?ui=tv|web` forces the library's interface on this browser (a TV whose User-Agent is
 * not recognised, or trying the other layout); `?ui=auto` goes back to detection.
 * The choice is stored in a cookie and the parameter dropped from the URL.
 */
export function middleware(request: NextRequest) {
  const value = request.nextUrl.searchParams.get(UI_MODE_PARAM);
  if (value === null) return NextResponse.next();

  const url = request.nextUrl.clone();
  url.searchParams.delete(UI_MODE_PARAM);
  const response = NextResponse.redirect(url);
  if (isUiMode(value)) {
    response.cookies.set(UI_MODE_COOKIE, value, { path: "/", maxAge: ONE_YEAR, sameSite: "lax" });
  } else {
    response.cookies.delete(UI_MODE_COOKIE);
  }
  return response;
}

export const config = {
  // Library pages only: the API, embeds, streams and static files never change layout
  matcher: ["/((?!api|_next|embed|m3u8|meu8|link|aniflow-doc|icons|fonts|.*\\..*).*)"],
};
