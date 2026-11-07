/**
 * Which interface the library serves: the 10-foot TV one (remote control, spatial
 * navigation) or the web one (mouse, keyboard and touch; top bar on wide screens, bottom
 * tabs on phones). Decided on the server from the User-Agent so the first render already
 * has the right layout; `?ui=tv|web|auto` overrides it and is remembered in a cookie.
 */

export type UiMode = "tv" | "web";

export const UI_MODE_COOKIE = "pk_ui";
export const UI_MODE_PARAM = "ui";

// Smart TV and set-top browsers, and the Fire TV / Android TV app (android-tv/, "PKAnimeTV").
// Phones and tablets never match these.
const TV_USER_AGENT =
  /PKAnimeTV|SmartTV|SMART-TV|Tizen|Web0S|webOS|NetCast|HbbTV|BRAVIA|Android TV|GoogleTV|CrKey|AFT[A-Z]|Roku|VIDAA|PhilipsTV|Viera|AQUOS|Hisense|DTV|TV Safari/i;

export function isUiMode(value: unknown): value is UiMode {
  return value === "tv" || value === "web";
}

export function detectUiMode(userAgent: string | null | undefined): UiMode {
  return userAgent && TV_USER_AGENT.test(userAgent) ? "tv" : "web";
}

export function resolveUiMode(override: string | null | undefined, userAgent: string | null | undefined): UiMode {
  return isUiMode(override) ? override : detectUiMode(userAgent);
}
