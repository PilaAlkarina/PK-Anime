/**
 * Settings of the server that the panel edits and the app reads (lib/server-settings.ts), in
 * .pk-settings.json at the project root. The app notices a change on its own, without a restart.
 */
import { readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { ROOT } from "../build-slots.mjs";

const FILE = join(ROOT, ".pk-settings.json");
export const STREAM_SERVERS = ["flow", "kitty", "buzz", "yuri", "zuri"];

function read() {
  try {
    return JSON.parse(readFileSync(FILE, "utf8")) || {};
  } catch {
    return {};
  }
}

/** The stream servers in the order the server choice falls back to; every one, once */
export function serverOrder() {
  const saved = Array.isArray(read().serverOrder) ? read().serverOrder : [];
  return [...new Set([...saved.filter((s) => STREAM_SERVERS.includes(s)), ...STREAM_SERVERS])];
}

export function setServerOrder(order) {
  if (!Array.isArray(order) || order.length !== STREAM_SERVERS.length || STREAM_SERVERS.some((s) => !order.includes(s))) {
    throw new Error("El orden tiene que incluir cada servidor una vez.");
  }
  const next = { ...read(), serverOrder: order };
  writeFileSync(`${FILE}.tmp`, `${JSON.stringify(next, null, 2)}\n`);
  renameSync(`${FILE}.tmp`, FILE);
  return serverOrder();
}
