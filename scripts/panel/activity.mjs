/**
 * What the app is serving, polled from /api/internal/stats every few seconds: video sent per
 * device, what each player is playing, the "Ver juntos" rooms and how real playback requests to
 * each stream server went. The app's counters start from zero on each start, so the totals per
 * day are kept here and in .panel-stats.json, which survives restarts of both.
 */
import { readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { ROOT } from "../build-slots.mjs";
import { appJson } from "./app-api.mjs";
import { describeAgent, nameOfIp } from "./devices.mjs";

const POLL_MS = 4000;
const STATS_FILE = join(ROOT, ".panel-stats.json");
const KEEP_DAYS = 14;
/** A device that sent nothing for this long isn't "watching now" any more */
const ACTIVE_MS = 45_000;
/** A player that hasn't reported for this long (it reports every 15 s while playing) is gone */
const PLAYER_GONE_MS = 60_000;

const dayKey = (ms = Date.now()) => {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

function loadTotals() {
  try {
    const saved = JSON.parse(readFileSync(STATS_FILE, "utf8"));
    return { days: saved.days ?? {}, bootId: saved.bootId ?? null, counted: saved.counted ?? 0 };
  } catch {
    return { days: {}, bootId: null, counted: 0 };
  }
}

let totals = loadTotals();
let latest = null;
let error = null;
let lastSave = 0;
let dirty = false;

function saveTotals(force = false) {
  if (!dirty || (!force && Date.now() - lastSave < 30_000)) return;
  const keys = Object.keys(totals.days).sort().slice(-KEEP_DAYS);
  totals.days = Object.fromEntries(keys.map((key) => [key, totals.days[key]]));
  try {
    writeFileSync(`${STATS_FILE}.tmp`, JSON.stringify(totals));
    renameSync(`${STATS_FILE}.tmp`, STATS_FILE);
    lastSave = Date.now();
    dirty = false;
  } catch {}
}

/** Adds what the app sent since the last poll to today's total */
function account(stats) {
  let delta;
  if (stats.bootId === totals.bootId) delta = Math.max(0, stats.bytes - totals.counted);
  // A new start of the app: everything it counted so far is new
  else delta = stats.bytes;
  totals.bootId = stats.bootId;
  totals.counted = stats.bytes;
  if (delta > 0) {
    const today = dayKey();
    totals.days[today] = (totals.days[today] ?? 0) + delta;
    dirty = true;
  }
  saveTotals();
}

async function poll(server) {
  if (!server.status().running) {
    latest = null;
    error = "PK Anime no está en marcha.";
    return;
  }
  try {
    const { status, data } = await appJson(server, "/api/internal/stats", { timeout: 8000 });
    if (status !== 200 || !data) throw new Error(`Respuesta ${status}`);
    latest = { ...data, receivedAt: Date.now() };
    error = null;
    account(data);
  } catch (err) {
    latest = null;
    error = err.message;
  }
}

export function startActivity(server) {
  let timer = null;
  const tick = async () => {
    await poll(server);
    timer = setTimeout(tick, POLL_MS);
  };
  tick();
  return {
    stop() {
      clearTimeout(timer);
      saveTotals(true);
    },
  };
}

const label = (ip, ua) => {
  const name = nameOfIp(ip);
  return { name, agent: describeAgent(ua), ip };
};

/** Everything the panel shows about traffic, playback and rooms */
export function activity() {
  const days = Object.entries(totals.days)
    .sort(([a], [b]) => (a < b ? 1 : -1))
    .slice(0, 7)
    .map(([day, bytes]) => ({ day, bytes }));
  const base = { today: totals.days[dayKey()] ?? 0, days, error };
  if (!latest) return { ...base, available: false };

  const now = latest.now ?? Date.now();
  const devices = latest.devices.map((d) => ({ ...d, ...label(d.ip, d.userAgent), active: now - d.lastSeen < ACTIVE_MS }));
  const byKey = new Map(devices.map((d) => [`${d.ip} ${d.userAgent}`, d]));

  // Players that reported recently, with the traffic of the device they run on
  const players = latest.players
    .filter((p) => now - p.updatedAt < PLAYER_GONE_MS)
    .map((p) => {
      const device = byKey.get(`${p.ip} ${p.userAgent}`);
      const { userAgent, ...rest } = p;
      return { ...rest, ...label(p.ip, userAgent), rate: device?.rate ?? 0, bytes: device?.bytes ?? 0 };
    })
    .sort((a, b) => b.startedAt - a.startedAt);
  const withPlayer = new Set(
    latest.players.filter((p) => now - p.updatedAt < PLAYER_GONE_MS).map((p) => `${p.ip} ${p.userAgent}`),
  );

  // Devices pulling video with no player report (an older app version, or something else)
  const others = devices
    .filter((d) => d.active && !withPlayer.has(`${d.ip} ${d.userAgent}`))
    .map(({ userAgent, ...d }) => d)
    .sort((a, b) => b.rate - a.rate);

  return {
    ...base,
    available: true,
    startedAt: latest.startedAt,
    rate: latest.rate,
    sinceStart: latest.bytes,
    byKind: latest.byKind,
    players,
    others,
    rooms: latest.rooms,
    servers: latest.servers,
    memory: latest.memory,
  };
}

/** The app's own memory use, from the last poll */
export const appMemory = () => latest?.memory ?? null;
