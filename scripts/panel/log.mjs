/**
 * The console the control panel shows: the last lines written by the server, the supervisor and
 * the panel's own tasks, each tagged with where it came from. Lines are also written to this
 * process's own stdout, so the terminal running `npm run serve` keeps showing everything.
 */

const LIMIT = 2000;
// Colors and cursor moves: the panel shows plain text
const ANSI = /\u001b\[[0-9;?]*[ -/]*[@-~]/g;

let seq = 0;
const lines = [];
const listeners = new Set();

/** Adds one line from `source` ("servidor", "serve", "tarea", "panel") */
export function pushLine(source, text, level = "info") {
  const line = { id: ++seq, t: Date.now(), source, level, text: text.replace(ANSI, "") };
  lines.push(line);
  if (lines.length > LIMIT) lines.splice(0, lines.length - LIMIT);
  for (const listener of listeners) listener(line);
  return line;
}

/** Lines after `afterId` (all of them for 0) */
export const linesSince = (afterId = 0) => lines.filter((line) => line.id > afterId);

/** Calls `listener` with every new line; returns the function that stops it */
export function onLine(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * Splits a child's output stream into lines for `source` and copies it to `echo` (this process's
 * stdout or stderr). A last line without a newline is kept until the next chunk or the end.
 */
export function captureStream(stream, source, echo, level = "info") {
  if (!stream) return;
  let rest = "";
  stream.setEncoding("utf8");
  stream.on("data", (chunk) => {
    echo.write(chunk);
    const parts = (rest + chunk).split(/\r?\n|\r/);
    rest = parts.pop() ?? "";
    for (const part of parts) if (part.trim()) pushLine(source, part, level);
  });
  stream.on("end", () => {
    if (rest.trim()) pushLine(source, rest, level);
    rest = "";
  });
}

/** console.log for the supervisor and the panel: to the terminal and to the panel's console */
export function say(source, message, level = "info") {
  (level === "error" ? process.stderr : process.stdout).write(`[${source}] ${message}\n`);
  pushLine(source, message, level);
}
