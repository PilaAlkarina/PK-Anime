import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * Settings of this server that the control panel edits (scripts/panel), in .pk-settings.json at
 * the project root. Read again whenever the file changes; missing or broken means the defaults.
 */

export type StreamServer = "flow" | "kitty" | "buzz" | "yuri" | "zuri";
export const STREAM_SERVERS: StreamServer[] = ["flow", "kitty", "buzz", "yuri", "zuri"];

const FILE = join(process.cwd(), ".pk-settings.json");

let cache: { mtime: number; order: StreamServer[] } | null = null;

/** Order of the stream servers when nothing else decides, set in the panel; every server once */
export function serverOrder(): StreamServer[] {
  let mtime = 0;
  try {
    mtime = statSync(FILE).mtimeMs;
  } catch {
    return STREAM_SERVERS;
  }
  if (cache && cache.mtime === mtime) return cache.order;
  let order = STREAM_SERVERS;
  try {
    const saved = JSON.parse(readFileSync(FILE, "utf8"))?.serverOrder;
    if (Array.isArray(saved)) {
      const listed = saved.filter((s): s is StreamServer => STREAM_SERVERS.includes(s));
      order = [...new Set([...listed, ...STREAM_SERVERS])];
    }
  } catch {}
  cache = { mtime, order };
  return order;
}
