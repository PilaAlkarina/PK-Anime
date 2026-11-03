import { cookies, headers } from "next/headers";
import { resolveUiMode, UI_MODE_COOKIE, type UiMode } from "./ui-mode";

/** Interface for the current request (server components only) */
export function getUiMode(): UiMode {
  return resolveUiMode(cookies().get(UI_MODE_COOKIE)?.value, headers().get("user-agent"));
}
