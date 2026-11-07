#!/usr/bin/env node
/**
 * npm run serve: the production server (next start) on the live build folder, restarted on the new
 * build as soon as `npm run deploy` switches it. Arguments go to next start
 * (npm run serve -- -p 3000 -H 0.0.0.0). If the server dies on its own it's started again.
 *
 * Before the first deploy it serves a build in .next, if there is one.
 *
 * With PANEL_PASSWORD set (in .env.local or the environment) it also runs the control panel
 * (scripts/panel): updates, rollback, restarts and the server's console from a browser. It lives
 * here rather than in the app so it keeps working while the app restarts or after a bad update.
 */
import { spawn, spawnSync } from "node:child_process";
import { EventEmitter } from "node:events";
import { existsSync, readFileSync, unwatchFile, watchFile } from "node:fs";
import { join } from "node:path";
import { parseEnv } from "node:util";
import { NEXT_BIN, POINTER, ROOT, activeSlot } from "./build-slots.mjs";
import { captureStream, say } from "./panel/log.mjs";

const args = process.argv.slice(2);
const isWindows = process.platform === "win32";
const RESTART_AFTER_CRASH_MS = 3000;

let child = null;
let running = null; // the folder `child` serves
let startedAt = null;
let lastExit = null;
let stopping = false;
let held = false; // stopped on purpose (installing dependencies): nothing starts it until released
let switching = false;
let crashTimer = null;
const events = new EventEmitter();

const log = (message, level) => say("serve", message, level);

/** The value of `-p 3000`, `--port=3000` and the like in the next start arguments */
function argValue(names) {
  for (let i = 0; i < args.length; i++) {
    const [name, inline] = args[i].split("=", 2);
    if (names.includes(name)) return inline ?? args[i + 1];
  }
  return undefined;
}
const appPort = Number(argValue(["-p", "--port"]) || process.env.PORT || 3000);
const appHost = argValue(["-H", "--hostname"]);

/** The folder to serve now: the live slot, or a plain .next build before the first deploy */
function current() {
  const slot = activeSlot();
  if (slot) return slot;
  return existsSync(join(ROOT, ".next", "BUILD_ID")) ? ".next" : null;
}

function start(folder) {
  running = folder;
  startedAt = Date.now();
  log(`Arrancando con ${folder}…`);
  child = spawn(process.execPath, [NEXT_BIN, "start", ...args], {
    cwd: ROOT,
    stdio: ["ignore", "pipe", "pipe"],
    // A process group of its own on Linux and macOS, so the whole tree stops together
    detached: !isWindows,
    env: { ...process.env, NODE_ENV: "production", ...(folder === ".next" ? {} : { NEXT_DIST_DIR: folder }) },
  });
  captureStream(child.stdout, "servidor", process.stdout);
  captureStream(child.stderr, "servidor", process.stderr, "error");
  const mine = child;
  mine.on("exit", (code, signal) => {
    if (child !== mine) return;
    child = null;
    lastExit = { at: Date.now(), code, signal };
    events.emit("change");
    if (stopping || held) return;
    log(`El servidor se ha cerrado (${signal ?? `código ${code}`}); se vuelve a arrancar en ${RESTART_AFTER_CRASH_MS / 1000} s.`, "error");
    crashTimer = setTimeout(() => {
      const folderNow = current();
      if (folderNow && !child && !held) start(folderNow);
    }, RESTART_AFTER_CRASH_MS);
  });
  events.emit("change");
}

/** Stops the server and everything it started (next start runs the real server in a child process) */
function stop() {
  const proc = child;
  if (!proc) return Promise.resolve();
  child = null;
  return new Promise((resolve) => {
    proc.once("exit", () => {
      events.emit("change");
      resolve();
    });
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

/** Brings the server in line with the live folder: restarts on a new build, starts it if it's down */
async function reconcile() {
  if (held || switching || stopping) return;
  const folder = current();
  if (!folder || (child && folder === running)) return;
  switching = true;
  clearTimeout(crashTimer);
  try {
    if (child) {
      log(`Nueva versión en ${folder}: reiniciando…`);
      await stop();
    }
    start(folder);
  } finally {
    switching = false;
  }
}

/** What the control panel can see and do with the server */
const server = {
  events,
  appPort,
  appHost,
  status: () => ({
    running: Boolean(child),
    held,
    folder: running,
    live: current(),
    pid: child?.pid ?? null,
    since: child ? startedAt : null,
    lastExit,
  }),
  async restart() {
    if (switching) return;
    switching = true;
    clearTimeout(crashTimer);
    try {
      log("Reinicio pedido desde el panel.");
      await stop();
      const folder = current();
      if (folder && !held) start(folder);
    } finally {
      switching = false;
    }
  },
  /** Stops the server until release(): nothing restarts it meanwhile */
  async hold() {
    held = true;
    clearTimeout(crashTimer);
    log("Servidor parado mientras dura la tarea.");
    await stop();
    events.emit("change");
  },
  release() {
    held = false;
    return reconcile();
  },
};

/** PANEL_* settings from .env.local / .env when they aren't in the environment; nothing else is read */
function loadPanelEnv() {
  for (const file of [".env.local", ".env"]) {
    let values;
    try {
      values = parseEnv(readFileSync(join(ROOT, file), "utf8"));
    } catch {
      continue;
    }
    for (const [key, value] of Object.entries(values)) {
      if (key.startsWith("PANEL_") && process.env[key] === undefined) process.env[key] = value;
    }
  }
}

let panel = null;

async function shutdown() {
  stopping = true;
  unwatchFile(POINTER);
  clearTimeout(crashTimer);
  panel?.close();
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
watchFile(POINTER, { interval: 1500 }, () => reconcile());
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

loadPanelEnv();
if (process.env.PANEL_PASSWORD) {
  const { startPanel } = await import("./panel/server.mjs");
  panel = startPanel(server);
} else {
  log("Panel de control desactivado: pon PANEL_PASSWORD en .env.local para usarlo.");
}
