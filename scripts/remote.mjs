#!/usr/bin/env node
/**
 * npm run remote: runs the control panel's tasks on the server from another computer and follows
 * them to the end, through the panel's API with PANEL_API_TOKEN.
 *
 *   npm run remote                 update: git pull on the server, then npm run deploy
 *   npm run remote -- rebuild      npm run deploy without pulling
 *   npm run remote -- rollback     back to the previous build
 *   npm run remote -- restart      restart the app
 *   npm run remote -- status       what the server runs and what it's missing, nothing else
 *   npm run remote -- --setup      makes a token, keeps it in this computer's .env.local and says
 *                                  what to add to the server's
 *
 * Reads REMOTE_PANEL_URL (the panel's address, e.g. http://pk.nord/admin) and REMOTE_PANEL_TOKEN
 * from the environment or this checkout's .env.local / .env. The token never goes on the command
 * line or to the console.
 */
import { randomBytes } from "node:crypto";
import { appendFileSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { ROOT } from "./build-slots.mjs";

const TASKS = { update: "update", rebuild: "deploy", rollback: "rollback", restart: "restart" };
const POLL_MS = 2000;
/** A build on the server takes a few minutes; past this something is stuck */
const GIVE_UP_MS = 30 * 60 * 1000;

const ENV_FILE = join(ROOT, ".env.local");

function readEnvFiles() {
  for (const file of [".env.local", ".env"]) {
    const path = join(ROOT, file);
    if (!existsSync(path)) continue;
    for (const raw of readFileSync(path, "utf8").split(/\r?\n/)) {
      const match = raw.match(/^\s*(REMOTE_PANEL_[A-Z_]+)\s*=\s*(.*?)\s*$/);
      if (!match) continue;
      const value = match[2].replace(/^(['"])(.*)\1$/, "$2");
      if (process.env[match[1]] === undefined) process.env[match[1]] = value;
    }
  }
}

function setup() {
  readEnvFiles();
  if (process.env.REMOTE_PANEL_TOKEN) {
    console.log("Este equipo ya tiene REMOTE_PANEL_TOKEN (en .env.local o en el entorno). Bórralo de ahí si quieres otro.");
    process.exit(1);
  }
  const token = randomBytes(32).toString("base64url");
  const url = process.env.REMOTE_PANEL_URL || "http://pk.nord/admin";
  const lines = [`REMOTE_PANEL_URL=${url}`, `REMOTE_PANEL_TOKEN=${token}`].filter((line) => !(line.startsWith("REMOTE_PANEL_URL") && process.env.REMOTE_PANEL_URL));
  const existing = existsSync(ENV_FILE) ? readFileSync(ENV_FILE, "utf8") : "";
  appendFileSync(ENV_FILE, `${existing && !existing.endsWith("\n") ? "\n" : ""}# npm run remote (panel del servidor)\n${lines.join("\n")}\n`);
  console.log(`Guardado en ${ENV_FILE}: ${lines.map((line) => line.split("=")[0]).join(" y ")}.`);
  console.log("\nAñade esta línea al .env.local del servidor y reinicia npm run serve allí:\n");
  console.log(`PANEL_API_TOKEN=${token}\n`);
  console.log("Si la dirección del panel no es la de REMOTE_PANEL_URL, cámbiala en .env.local.");
}

async function api(path, { method = "GET" } = {}) {
  const base = process.env.REMOTE_PANEL_URL.replace(/\/+$/, "");
  let res;
  try {
    res = await fetch(`${base}${path}`, {
      method,
      headers: { Authorization: `Bearer ${process.env.REMOTE_PANEL_TOKEN}`, Accept: "application/json" },
      signal: AbortSignal.timeout(20_000),
    });
  } catch (error) {
    throw new Error(`No se puede conectar con el panel (${base}): ${error.cause?.code || error.message}`);
  }
  const text = await res.text();
  let data = null;
  try {
    data = JSON.parse(text);
  } catch {}
  if (!res.ok) throw new Error(`${res.status}: ${data?.error || text.slice(0, 200) || res.statusText}`);
  return data ?? text;
}

const commit = (head) => (head ? `${head.hash} ${head.subject}` : "?");

function describe(state) {
  const git = state.git || {};
  const server = state.server || {};
  const parts = [
    `Rama ${git.branch ?? "?"} en ${commit(git.head)}`,
    git.behind ? `le faltan ${git.behind} cambio(s) de ${git.upstream}` : git.upstream ? `al día con ${git.upstream} (según el último fetch)` : "sin rama remota",
  ];
  if (git.dirty?.length) parts.push(`${git.dirty.length} archivo(s) con cambios sin guardar`);
  console.log(parts.join(" · "));
  const bits = Object.entries(server)
    .filter(([, value]) => ["string", "number", "boolean"].includes(typeof value))
    .map(([key, value]) => `${key}: ${value}`);
  if (bits.length) console.log(`Servidor → ${bits.join(", ")}`);
}

async function follow(jobId) {
  const shown = new Map();
  const started = Date.now();
  for (;;) {
    const state = await api("/api/state");
    const job = state.job?.id === jobId ? state.job : state.history?.find((entry) => entry.id === jobId);
    if (!job) throw new Error("La tarea ya no aparece en el panel (¿se ha reiniciado npm run serve?).");
    job.steps.forEach((step, i) => {
      if (shown.get(i) === step.status) return;
      shown.set(i, step.status);
      const mark = step.status === "ok" ? "✔" : step.status === "error" ? "✖" : "…";
      console.log(`  ${mark} ${step.title}`);
    });
    if (job.status !== "running") return { job, state };
    if (Date.now() - started > GIVE_UP_MS) throw new Error("La tarea lleva demasiado tiempo: mírala en el panel.");
    await new Promise((resolve) => setTimeout(resolve, POLL_MS));
  }
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes("--setup")) return setup();
  readEnvFiles();
  if (!process.env.REMOTE_PANEL_URL || !process.env.REMOTE_PANEL_TOKEN) {
    console.error("Faltan REMOTE_PANEL_URL y REMOTE_PANEL_TOKEN: ejecuta npm run remote -- --setup.");
    process.exit(1);
  }

  const command = args.find((arg) => !arg.startsWith("-")) || "update";
  if (command === "status") return describe(await api("/api/state"));
  const action = TASKS[command];
  if (!action) {
    console.error(`Orden desconocida: ${command}. Usa update, rebuild, rollback, restart o status.`);
    process.exit(1);
  }

  describe(await api("/api/state"));
  const { job } = await api(`/api/action/${action}`, { method: "POST" });
  console.log(`\n${job.title} en el servidor:`);
  const { job: done, state } = await follow(job.id);
  const seconds = Math.round(((done.endedAt ?? Date.now()) - done.startedAt) / 1000);
  for (const warning of done.warnings ?? []) console.log(`  ⚠ ${warning}`);
  if (done.status === "ok") {
    console.log(`\n✔ ${done.title}: terminado en ${seconds} s.`);
    describe(state);
    return;
  }
  console.error(`\n✖ ${done.title}: ${done.error}`);
  // The task's last lines in the server's console usually say why
  const log = await api("/api/log?source=tarea").catch(() => "");
  const tail = String(log).trim().split("\n").slice(-25);
  if (tail.length) console.error(`\nÚltimas líneas de la tarea:\n${tail.join("\n")}`);
  process.exit(1);
}

main().catch((error) => {
  console.error(`✖ ${error.message}`);
  process.exit(1);
});
