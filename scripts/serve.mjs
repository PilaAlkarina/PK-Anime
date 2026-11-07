#!/usr/bin/env node
/**
 * npm run serve: the production server (next start) on the live build folder, restarted on the new
 * build as soon as `npm run deploy` switches it. Arguments go to next start
 * (npm run serve -- -p 3000 -H 0.0.0.0). If the server dies on its own it's started again.
 *
 * Before the first deploy it serves a build in .next, if there is one.
 */
import { spawn, spawnSync } from "node:child_process";
import { existsSync, unwatchFile, watchFile } from "node:fs";
import { join } from "node:path";
import { NEXT_BIN, POINTER, ROOT, activeSlot } from "./build-slots.mjs";

const args = process.argv.slice(2);
const isWindows = process.platform === "win32";
const RESTART_AFTER_CRASH_MS = 3000;

let child = null;
let running = null; // the folder `child` serves
let stopping = false;
let crashTimer = null;

const log = (message) => console.log(`[serve] ${message}`);

/** The folder to serve now: the live slot, or a plain .next build before the first deploy */
function current() {
  const slot = activeSlot();
  if (slot) return slot;
  return existsSync(join(ROOT, ".next", "BUILD_ID")) ? ".next" : null;
}

function start(folder) {
  running = folder;
  log(`Arrancando con ${folder}…`);
  child = spawn(process.execPath, [NEXT_BIN, "start", ...args], {
    cwd: ROOT,
    stdio: "inherit",
    // A process group of its own on Linux and macOS, so the whole tree stops together
    detached: !isWindows,
    env: { ...process.env, NODE_ENV: "production", ...(folder === ".next" ? {} : { NEXT_DIST_DIR: folder }) },
  });
  const mine = child;
  mine.on("exit", (code, signal) => {
    if (child !== mine) return;
    child = null;
    if (stopping) return;
    log(`El servidor se ha cerrado (${signal ?? `código ${code}`}); se vuelve a arrancar en ${RESTART_AFTER_CRASH_MS / 1000} s.`);
    crashTimer = setTimeout(() => {
      const folderNow = current();
      if (folderNow && !child) start(folderNow);
    }, RESTART_AFTER_CRASH_MS);
  });
}

/** Stops the server and everything it started (next start runs the real server in a child process) */
function stop() {
  const proc = child;
  if (!proc) return Promise.resolve();
  child = null;
  return new Promise((resolve) => {
    proc.once("exit", () => resolve());
    if (isWindows) spawnSync("taskkill", ["/pid", String(proc.pid), "/T", "/F"], { stdio: "ignore" });
    else {
      try {
        process.kill(-proc.pid, "SIGTERM");
      } catch {
        proc.kill("SIGTERM");
      }
    }
    // A process that ignores the signal doesn't hold the restart up
    setTimeout(resolve, 8000);
  });
}

let switching = false;
async function onPointerChange() {
  const folder = current();
  if (!folder || folder === running || switching) return;
  switching = true;
  clearTimeout(crashTimer);
  log(`Nueva versión en ${folder}: reiniciando…`);
  await stop();
  start(folder);
  switching = false;
}

async function shutdown() {
  stopping = true;
  unwatchFile(POINTER);
  clearTimeout(crashTimer);
  await stop();
  process.exit(0);
}

const first = current();
if (!first) {
  console.error("[serve] No hay ninguna versión compilada. Ejecuta antes npm run deploy.");
  process.exit(1);
}
start(first);
// Polling, so it works the same on every system and when the file is replaced by a rename
watchFile(POINTER, { interval: 1500 }, onPointerChange);
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
