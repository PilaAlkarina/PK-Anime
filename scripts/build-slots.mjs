/**
 * The two build folders a production server takes turns on, and the file that says which one
 * is live. Shared by deploy.mjs (builds into the idle one, then points at it) and serve.mjs (runs
 * the live one and restarts when the pointer changes).
 */
import { existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = fileURLToPath(new URL("..", import.meta.url));
export const SLOTS = [".next-a", ".next-b"];
export const POINTER = join(ROOT, ".next-active");

/** The live build folder, or null when nothing has been deployed yet */
export function activeSlot() {
  try {
    const slot = readFileSync(POINTER, "utf8").trim();
    return SLOTS.includes(slot) ? slot : null;
  } catch {
    return null;
  }
}

/** Whether a folder holds a finished build */
export const isBuilt = (slot) => existsSync(join(ROOT, slot, "BUILD_ID"));

export const otherSlot = (slot) => (slot === SLOTS[0] ? SLOTS[1] : SLOTS[0]);

/** Points the server at `slot`; written to a temporary file and renamed, so it's never half-written */
export function setActiveSlot(slot) {
  const tmp = `${POINTER}.tmp`;
  writeFileSync(tmp, `${slot}\n`);
  renameSync(tmp, POINTER);
}

/** The `next` CLI, run with this Node rather than through npx, so it can be stopped cleanly */
export const NEXT_BIN = join(ROOT, "node_modules", "next", "dist", "bin", "next");
