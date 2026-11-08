#!/usr/bin/env node
/**
 * Checks the stream server ranking (lib/server-ranking.ts) against the agreed rules:
 * language first, HTTPS within a language, a clearly better connection over the language variant,
 * then the order. Run with: node scripts/check-server-ranking.mjs (Node 23.6+ runs the .ts as is).
 */
const { compareServers, decidedBy } = await import(new URL("../lib/server-ranking.ts", import.meta.url).href);
const conn = (o = {}) => ({ startMs: 1500, throughput: 4e6, degraded: false, down: false, source: "uso real", ...o });
const s = (name, o = {}) => ({ name, state: "ok", https: true, audioMatch: true, level: 0, variant: 1, connection: conn(), orderIndex: 0, ...o });
const rank = (...list) => [...list].sort(compareServers);
let failed = 0;
function check(title, list, expected, expectedReason) {
  const ranked = rank(...list);
  const got = ranked[0].name;
  const reason = decidedBy(ranked[0], ranked[1]);
  const ok = got === expected && (!expectedReason || reason === expectedReason);
  if (!ok) failed++;
  console.log(`${ok ? "OK  " : "FAIL"} ${title}: ${got} (${reason})${ok ? "" : ` — expected ${expected}${expectedReason ? ` (${expectedReason})` : ""}`}`);
}

// Language always decides
check("Spanish beats English even when much faster", [
  s("flow", { level: 1, orderIndex: 0, connection: conn({ startMs: 500, throughput: 2e7 }) }),
  s("buzz", { level: 0, orderIndex: 2, connection: conn({ startMs: 4000, throughput: 1e6 }) }),
], "buzz", "idioma");

// HTTPS only within the same language
check("HTTPS beats HTTP in the same language", [
  s("flow", { https: false, orderIndex: 0 }),
  s("kitty", { https: true, orderIndex: 1 }),
], "kitty", "seguridad");
check("HTTP with Spanish beats HTTPS with English", [
  s("flow", { https: false, level: 0, orderIndex: 3 }),
  s("kitty", { https: true, level: 1, orderIndex: 0 }),
], "flow", "idioma");
check("HTTPS Latin American beats HTTP from Spain", [
  s("flow", { https: false, variant: 0, orderIndex: 0 }),
  s("kitty", { https: true, variant: 2, orderIndex: 1 }),
], "kitty", "seguridad");

// The variant yields to a clearly better connection
check("Spain beats Latin American with similar connections", [
  s("flow", { variant: 2, orderIndex: 0 }),
  s("kitty", { variant: 0, orderIndex: 1 }),
], "kitty", "variante");
check("Latin American wins when Spain's server is too slow", [
  s("flow", { variant: 2, orderIndex: 0, connection: conn({ throughput: 5e6 }) }),
  s("kitty", { variant: 0, orderIndex: 1, connection: conn({ throughput: 6e5 }) }),
], "flow", "conexión");
check("Latin American wins when Spain's server is degraded", [
  s("flow", { variant: 2, orderIndex: 0 }),
  s("kitty", { variant: 0, orderIndex: 1, connection: conn({ degraded: true }) }),
], "flow", "conexión");
check("Spain keeps it with a small speed difference", [
  s("flow", { variant: 2, orderIndex: 0, connection: conn({ startMs: 1000 }) }),
  s("kitty", { variant: 0, orderIndex: 1, connection: conn({ startMs: 1600 }) }),
], "kitty", "variante");
check("Twice as slow to start (and 1.5 s more) yields", [
  s("flow", { variant: 2, orderIndex: 0, connection: conn({ startMs: 1000 }) }),
  s("kitty", { variant: 0, orderIndex: 1, connection: conn({ startMs: 3000 }) }),
], "flow", "conexión");

// Order last
check("Same everything: order decides", [
  s("yuri", { orderIndex: 3 }),
  s("buzz", { orderIndex: 2 }),
], "buzz", "orden");
check("Unknown connection never counts as clearly better", [
  s("flow", { orderIndex: 0, connection: conn({ startMs: null, throughput: null, source: null }) }),
  s("kitty", { orderIndex: 1 }),
], "flow", "orden");

// Availability and audio
check("A down server loses even with the best language", [
  s("flow", { level: 0, connection: conn({ down: true }) }),
  s("kitty", { level: 1, orderIndex: 1 }),
], "kitty");
check("Real dub beats a Japanese fallback", [
  s("flow", { audioMatch: false, orderIndex: 0 }),
  s("buzz", { audioMatch: true, level: 1, orderIndex: 2 }),
], "buzz", "audio");
check("Missing servers go last", [
  s("flow", { state: "unavailable", orderIndex: 0 }),
  s("zuri", { orderIndex: 4 }),
], "zuri", "único");

console.log(failed ? `\n${failed} failed` : "\nAll rules hold");
process.exit(failed ? 1 : 0);
