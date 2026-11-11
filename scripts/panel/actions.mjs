/**
 * What the control panel can do: a closed list of tasks, each a fixed sequence of commands with
 * fixed arguments (nothing typed in the panel ever reaches a command line). One task at a time;
 * its output goes to the panel's console as "tarea".
 */
import { execFile, spawn } from "node:child_process";
import { statSync } from "node:fs";
import { join } from "node:path";
import { ROOT } from "../build-slots.mjs";
import { captureStream, onLine, say } from "./log.mjs";

const DEPLOY_SCRIPT = join(ROOT, "scripts", "deploy.mjs");
const HISTORY = 15;

// Commands never wait for a prompt nobody can answer: a git that needs credentials fails instead
const COMMAND_ENV = {
  ...process.env,
  GIT_TERMINAL_PROMPT: "0",
  GCM_INTERACTIVE: "never",
  FORCE_COLOR: "0",
  NO_COLOR: "1",
};
// npm install leaves devDependencies out under NODE_ENV=production, and the build needs them
delete COMMAND_ENV.NODE_ENV;

const note = (message, level) => say("tarea", message, level);

// ---- git, read-only -------------------------------------------------------------------------------

function git(args, { trim = true } = {}) {
  return new Promise((resolve) => {
    execFile("git", ["-c", "core.quotepath=off", ...args], { cwd: ROOT, env: COMMAND_ENV, windowsHide: true }, (error, stdout) =>
      resolve(error ? null : trim ? stdout.trim() : stdout),
    );
  });
}

/** `git status --porcelain` lines ("XY path", "R  old -> new") → the paths; the first column can be a space */
const parseStatus = (text) =>
  (text || "")
    .split("\n")
    .filter((line) => line.length > 3)
    .map((line) => line.slice(3).split(" -> ").pop());

const SEP = "\u001f";
const parseCommits = (text) =>
  (text ? text.split("\n") : []).map((row) => {
    const [hash, subject, author, date] = row.split(SEP);
    return { hash, subject, author, date };
  });

let infoCache = null;

/** Branch, commit, what the remote has that this checkout doesn't, and uncommitted changes */
export async function gitInfo({ fresh = false } = {}) {
  if (!fresh && infoCache && Date.now() - infoCache.at < 1500) return infoCache.value;
  const format = ["%h", "%s", "%an", "%cI"].join("%x1f");
  const [branch, head, upstream, gitDir, dirty] = await Promise.all([
    git(["rev-parse", "--abbrev-ref", "HEAD"]),
    git(["log", "-1", `--format=${format}`]),
    git(["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"]),
    git(["rev-parse", "--absolute-git-dir"]),
    git(["status", "--porcelain", "--untracked-files=no"], { trim: false }),
  ]);
  let ahead = 0;
  let behind = 0;
  let pending = [];
  if (upstream) {
    const [counts, log] = await Promise.all([
      git(["rev-list", "--left-right", "--count", "HEAD...@{u}"]),
      git(["log", "-n", "50", `--format=${format}`, "HEAD..@{u}"]),
    ]);
    [ahead, behind] = (counts || "0 0").split(/\s+/).map(Number);
    pending = parseCommits(log);
  }
  let lastFetch = null;
  try {
    if (gitDir) lastFetch = statSync(join(gitDir, "FETCH_HEAD")).mtimeMs;
  } catch {}
  const value = {
    available: branch !== null,
    branch,
    head: head ? parseCommits(head)[0] : null,
    upstream,
    ahead,
    behind,
    pending,
    dirty: parseStatus(dirty),
    lastFetch,
  };
  infoCache = { at: Date.now(), value };
  return value;
}

// ---- running commands -----------------------------------------------------------------------------

class StepError extends Error {}

/** `npm <args>`: through the npm that started `npm run serve` when there is one, else the PATH's */
function npmCommand(args) {
  const cli = process.env.npm_execpath;
  if (cli && /\.[cm]?js$/.test(cli)) return { command: process.execPath, args: [cli, ...args], shell: false };
  // Windows can only start npm.cmd through a shell; the arguments are fixed, never from the panel
  return { command: `npm ${args.join(" ")}`, args: [], shell: true };
}

function run(label, command, args, { shell = false } = {}) {
  note(`Ejecutando: ${label}`);
  // The command's last words usually say why it failed: they go in the task's error
  let lastLine = "";
  const stopListening = onLine((line) => {
    if (line.source === "tarea") lastLine = line.text.replace(/^\[\w+\]\s*/, "").trim();
  });
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: ROOT, env: COMMAND_ENV, shell, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
    captureStream(child.stdout, "tarea", process.stdout);
    captureStream(child.stderr, "tarea", process.stderr);
    child.on("error", (error) => {
      stopListening();
      reject(new StepError(`${label}: ${error.message}`));
    });
    child.on("close", (code, signal) => {
      stopListening();
      if (code === 0) return resolve();
      const how = signal ?? `el código ${code}`;
      reject(new StepError(lastLine ? `${lastLine} (${label}: ${how})` : `${label} ha terminado con ${how}`));
    });
  });
}

const runNode = (label, args) => run(label, process.execPath, args);
const runGit = (args) => run(`git ${args.join(" ")}`, "git", args);
const runNpm = (args) => {
  const { command, args: argv, shell } = npmCommand(args);
  return run(`npm ${args.join(" ")}`, command, argv, { shell });
};

// ---- the tasks ------------------------------------------------------------------------------------

/**
 * Each task gets `step(title, fn)`, which shows progress in the panel, and `warn(text)` for
 * something the user should know once it ends. Throwing ends the task as failed.
 */
export const ACTIONS = {
  fetch: {
    title: "Buscar cambios",
    async run({ step }) {
      await step("Consultar GitHub", () => runGit(["fetch", "--prune"]));
      const info = await gitInfo({ fresh: true });
      note(info.behind ? `Hay ${info.behind} cambio(s) nuevo(s) en ${info.upstream}.` : "No hay cambios nuevos.");
    },
  },

  update: {
    title: "Actualizar",
    async run({ step, warn, server }) {
      await step("Consultar GitHub", () => runGit(["fetch", "--prune"]));
      const info = await gitInfo({ fresh: true });
      if (!info.upstream) throw new StepError(`La rama ${info.branch} no sigue a ninguna rama remota.`);
      if (info.dirty.length) {
        note(`Archivos con cambios sin guardar:\n${info.dirty.map((file) => `  ${file}`).join("\n")}`, "error");
        throw new StepError(`Hay cambios sin guardar en ${info.dirty.length} archivo(s) de este equipo: guárdalos o descártalos antes.`);
      }
      if (info.ahead) {
        throw new StepError(`Este equipo tiene ${info.ahead} commit(s) que no están en ${info.upstream}: hay que unirlos a mano.`);
      }
      if (!info.behind) {
        note("Ya estaba al día: no hay nada que compilar. Usa Recompilar si quieres compilar de nuevo.");
        return;
      }

      const before = await git(["rev-parse", "HEAD"]);
      await step(`Descargar ${info.behind} cambio(s)`, () => runGit(["pull", "--ff-only"]));
      const changed = ((await git(["diff", "--name-only", before, "HEAD"])) || "").split("\n").filter(Boolean);
      const dependencies = changed.some((file) => file === "package.json" || file === "package-lock.json");

      if (dependencies) {
        // On Windows a running server keeps files in node_modules open, and the install fails
        note("Han cambiado las dependencias: el servidor se para mientras se instalan y se compila.");
        await server.hold();
        try {
          await step("Instalar dependencias", () => runNpm(["install", "--no-audit", "--no-fund"]));
          await step("Compilar", () => runNode("node scripts/deploy.mjs", [DEPLOY_SCRIPT]));
        } finally {
          // The new build if it finished, else the one that was live before
          await server.release();
        }
      } else {
        await step("Compilar", () => runNode("node scripts/deploy.mjs", [DEPLOY_SCRIPT]));
        await server.release();
      }

      if (changed.some((file) => file.startsWith("scripts/"))) {
        warn("Han cambiado los scripts del servidor (scripts/): reinicia npm run serve en el equipo para usarlos.");
      }
    },
  },

  deploy: {
    title: "Recompilar",
    async run({ step, server }) {
      await step("Compilar", () => runNode("node scripts/deploy.mjs", [DEPLOY_SCRIPT]));
      await server.release();
    },
  },

  rollback: {
    title: "Volver a la versión anterior",
    async run({ step, warn, server }) {
      await step("Cambiar a la compilación anterior", () => runNode("node scripts/deploy.mjs --rollback", [DEPLOY_SCRIPT, "--rollback"]));
      await server.release();
      warn("El código descargado no cambia: la próxima actualización o recompilación vuelve a compilar lo último.");
    },
  },

  restart: {
    title: "Reiniciar el servidor",
    async run({ step, server }) {
      await step("Reiniciar", () => server.restart());
    },
  },
};

// ---- one task at a time ---------------------------------------------------------------------------

let current = null;
const history = [];
let nextId = 1;
const listeners = new Set();
const changed = () => {
  for (const listener of listeners) listener();
};

export const onJobChange = (listener) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export const jobState = () => ({ job: current, history });

/** Starts `name` unless another task is running */
export function startAction(name, server) {
  const action = ACTIONS[name];
  if (!action) return { ok: false, error: "Acción desconocida" };
  if (current) return { ok: false, error: `Ya hay una tarea en marcha: ${current.title}` };

  const job = { id: nextId++, action: name, title: action.title, status: "running", startedAt: Date.now(), endedAt: null, steps: [], warnings: [], error: null };
  current = job;
  note(`— ${job.title} —`);
  changed();

  const step = async (title, fn) => {
    const entry = { title, status: "running" };
    job.steps.push(entry);
    changed();
    try {
      await fn();
      entry.status = "ok";
    } catch (error) {
      entry.status = "error";
      throw error;
    } finally {
      changed();
    }
  };
  const warn = (text) => {
    job.warnings.push(text);
    note(text, "error");
    changed();
  };

  action
    .run({ step, warn, server })
    .then(() => {
      job.status = "ok";
      note(`${job.title}: terminado en ${Math.round((Date.now() - job.startedAt) / 1000)} s.`);
    })
    .catch((error) => {
      job.status = "error";
      job.error = error instanceof StepError ? error.message : `Error inesperado: ${error?.message ?? error}`;
      note(`${job.title}: ${job.error}`, "error");
    })
    .finally(() => {
      job.endedAt = Date.now();
      current = null;
      history.unshift(job);
      history.splice(HISTORY);
      infoCache = null;
      changed();
    });

  return { ok: true, job };
}
