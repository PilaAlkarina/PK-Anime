#!/usr/bin/env node
/**
 * npm run deploy: builds the app into the build folder that isn't live (.next-a or .next-b) while
 * the server keeps running from the other one, and only when the build has finished points the
 * server at it (.next-active). `npm run serve` notices and restarts on the new build in a couple
 * of seconds. A failed build changes nothing.
 *
 * npm run rollback: points back at the previous build, if it's still there.
 *
 * `.next` itself is never touched, so `npm run dev` can keep running alongside.
 */
import { spawn } from "node:child_process";
import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { NEXT_BIN, ROOT, activeSlot, isBuilt, otherSlot, setActiveSlot } from "./build-slots.mjs";

const live = activeSlot();

if (process.argv.includes("--rollback")) {
  const previous = live ? otherSlot(live) : null;
  if (!previous || !isBuilt(previous)) {
    console.error("[deploy] No hay una versión anterior a la que volver.");
    process.exit(1);
  }
  setActiveSlot(previous);
  console.log(`[deploy] Vuelta a la versión anterior (${previous}). Si npm run serve está en marcha, se reinicia solo.`);
  process.exit(0);
}

const target = live ? otherSlot(live) : ".next-a";
console.log(`[deploy] Compilando en ${target}${live ? ` (el servidor sigue con ${live})` : ""}…`);

// Whatever was there is the build before the live one: not in use
rmSync(join(ROOT, target), { recursive: true, force: true });

// next build adds its distDir's types to tsconfig.json when they aren't listed; put it back after,
// so the checkout stays clean for the next git pull
const tsconfigPath = join(ROOT, "tsconfig.json");
const tsconfigBefore = readFileSync(tsconfigPath, "utf8");

const started = Date.now();
const code = await new Promise((resolve) => {
  const child = spawn(process.execPath, [NEXT_BIN, "build"], {
    cwd: ROOT,
    stdio: "inherit",
    env: { ...process.env, NEXT_DIST_DIR: target, NODE_ENV: "production" },
  });
  child.on("exit", (exitCode, signal) => resolve(signal ? 1 : exitCode ?? 1));
  child.on("error", () => resolve(1));
});

if (readFileSync(tsconfigPath, "utf8") !== tsconfigBefore) writeFileSync(tsconfigPath, tsconfigBefore);

if (code !== 0 || !isBuilt(target)) {
  console.error(`[deploy] La compilación ha fallado: el servidor sigue con ${live ?? "lo que tuviera"}.`);
  process.exit(1);
}

setActiveSlot(target);
const seconds = Math.round((Date.now() - started) / 1000);
console.log(`[deploy] Listo en ${seconds} s: ${target} es ahora la versión activa.`);
console.log("[deploy] Si npm run serve está en marcha, se reinicia solo; si no, arráncalo con npm run serve.");
