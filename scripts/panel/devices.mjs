/**
 * Friendly names for the devices the panel lists: the name the hosts file gives an address (NordVPN
 * Meshnet writes its devices there, like pc.nord) and a short description of the browser or app.
 */
import { readFileSync } from "node:fs";

const HOSTS_FILE =
  process.platform === "win32"
    ? `${process.env.SystemRoot || "C:\\Windows"}\\System32\\drivers\\etc\\hosts`
    : "/etc/hosts";
const CACHE_MS = 60_000;

let cache = { at: 0, names: new Map() };

function hostNames() {
  if (Date.now() - cache.at < CACHE_MS) return cache.names;
  const names = new Map();
  try {
    for (const raw of readFileSync(HOSTS_FILE, "utf8").split(/\r?\n/)) {
      const [ip, name] = raw.replace(/#.*/, "").trim().split(/\s+/);
      if (ip && name && !names.has(ip) && name !== "localhost") names.set(ip, name);
    }
  } catch {}
  cache = { at: Date.now(), names };
  return names;
}

const LOOPBACK = new Set(["127.0.0.1", "::1", "localhost"]);

/** "pc.nord", "Este equipo", or null */
export function nameOfIp(ip) {
  if (LOOPBACK.has(ip)) return "Este equipo";
  return hostNames().get(ip) ?? null;
}

/** "App de TV 1.0.3", "Chrome · Android", "Edge · Windows"… from a User-Agent */
export function describeAgent(ua = "") {
  const tvApp = ua.match(/PKAnimeTV\/([\d.]+)/);
  if (tvApp) return /AFT\w/.test(ua) ? `App de TV ${tvApp[1]} · Fire TV` : `App de TV ${tvApp[1]}`;
  if (/AFT\w/.test(ua)) return "Fire TV";
  if (/Tizen|SMART-TV/i.test(ua)) return "Samsung TV";
  if (/Web0S|webOS/i.test(ua)) return "LG TV";
  if (/^(node|undici|axios)/i.test(ua) || !ua) return "Programa (sin navegador)";

  const browser =
    /EdgA?\//.test(ua) ? "Edge" :
    /OPR\//.test(ua) ? "Opera" :
    /SamsungBrowser\//.test(ua) ? "Samsung Internet" :
    /Firefox\//.test(ua) ? "Firefox" :
    /Chrome\//.test(ua) ? "Chrome" :
    /Safari\//.test(ua) ? "Safari" : "Navegador";
  const system =
    /iPhone/.test(ua) ? "iPhone" :
    /iPad/.test(ua) ? "iPad" :
    /Android/.test(ua) ? (/Mobile/.test(ua) ? "Android (móvil)" : "Android") :
    /Windows/.test(ua) ? "Windows" :
    /Mac OS X|Macintosh/.test(ua) ? "Mac" :
    /CrOS/.test(ua) ? "ChromeOS" :
    /Linux/.test(ua) ? "Linux" : "";
  return system ? `${browser} · ${system}` : browser;
}
