/**
 * The machine the server runs on: processor and memory use, free disk, how long it's been up and
 * how much the build folders take.
 */
import { existsSync, readFileSync, statfsSync } from "node:fs";
import { lstat, readdir } from "node:fs/promises";
import os from "node:os";
import { join } from "node:path";
import { ROOT } from "../build-slots.mjs";

const CPU_SAMPLE_MS = 3000;
const SIZES_CACHE_MS = 10 * 60 * 1000;
const FOLDERS = [".next-a", ".next-b", ".next"];

// Processor use: the share of time not idle between two samples, over all cores
let previous = os.cpus();
let cpuPercent = null;
const sampler = setInterval(() => {
  const now = os.cpus();
  let idle = 0;
  let total = 0;
  now.forEach((cpu, i) => {
    const before = previous[i]?.times;
    if (!before) return;
    for (const key of Object.keys(cpu.times)) total += cpu.times[key] - before[key];
    idle += cpu.times.idle - before.idle;
  });
  if (total > 0) cpuPercent = Math.round((1 - idle / total) * 100);
  previous = now;
}, CPU_SAMPLE_MS);
sampler.unref();

async function folderSize(path) {
  let total = 0;
  let entries;
  try {
    entries = await readdir(path, { withFileTypes: true });
  } catch {
    return 0;
  }
  for (const entry of entries) {
    const full = join(path, entry.name);
    if (entry.isDirectory()) total += await folderSize(full);
    else {
      try {
        total += (await lstat(full)).size;
      } catch {}
    }
  }
  return total;
}

let sizes = { at: 0, key: "", value: null, running: null };

/**
 * Sizes of the build folders, measured in the background and kept for a while; measured again
 * at once when a folder appears or goes, or another one goes live (a deploy)
 */
function buildSizes(live) {
  const present = FOLDERS.filter((folder) => existsSync(join(ROOT, folder)));
  const key = `${present.join(",")}|${live}`;
  if (!sizes.running && (key !== sizes.key || Date.now() - sizes.at > SIZES_CACHE_MS)) {
    sizes.running = Promise.all(
      present.map(async (folder) => ({ folder, bytes: await folderSize(join(ROOT, folder)) })),
    )
      .then((value) => {
        sizes = { at: Date.now(), key, value, running: null };
      })
      .catch(() => {
        sizes.running = null;
      });
  }
  return sizes.value;
}

function disk() {
  try {
    const stats = statfsSync(ROOT);
    return { total: stats.blocks * stats.bsize, free: stats.bavail * stats.bsize };
  } catch {
    return null;
  }
}

function cpuName() {
  return os.cpus()[0]?.model?.replace(/\s+/g, " ").trim() ?? null;
}

function osName() {
  if (process.platform === "win32") return `Windows ${os.release()}`;
  try {
    const pretty = readFileSync("/etc/os-release", "utf8").match(/^PRETTY_NAME="?([^"\n]+)/m);
    if (pretty) return pretty[1];
  } catch {}
  return `${os.type()} ${os.release()}`;
}

export function machine({ appMemory, live }) {
  return {
    hostname: os.hostname(),
    os: osName(),
    cpu: { model: cpuName(), cores: os.cpus().length, percent: cpuPercent, load: process.platform === "win32" ? null : os.loadavg() },
    memory: { total: os.totalmem(), free: os.freemem(), app: appMemory, panel: process.memoryUsage().rss },
    disk: disk(),
    uptime: os.uptime(),
    panelUptime: process.uptime(),
    node: process.version,
    builds: buildSizes(live)?.map((entry) => ({ ...entry, live: entry.folder === live })) ?? null,
  };
}
