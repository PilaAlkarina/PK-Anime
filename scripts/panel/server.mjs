/**
 * The control panel's web server, run by scripts/serve.mjs when PANEL_PASSWORD is set.
 *
 * Where it answers:
 * - PANEL_PORT alone (3001 by default): the whole port is the panel, http://host:3001/
 * - PANEL_PATH (e.g. /admin) or PANEL_HOSTNAME (e.g. admin.example.lan): the port is the front door
 *   for the whole site. Requests under that path, or for that name, are the panel; everything else
 *   goes on to the app on the next start port. With PANEL_PORT=80 and the app on another port
 *   (npm run serve -- -p 3000), http://host/admin is the panel and http://host/ the library.
 *
 * Sign-in is the password in PANEL_PASSWORD, kept as a signed cookie for 30 days. Changing the
 * password signs everyone out.
 *
 * Scripts (npm run remote on another computer) use PANEL_API_TOKEN instead: the header
 * `Authorization: Bearer <token>` opens the same API without a cookie. It's a separate secret, so
 * the password never sits in a file, and wrong tokens count towards the same lockout.
 */
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { createServer, request as httpRequest } from "node:http";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ROOT } from "../build-slots.mjs";
import { gitInfo, jobState, onJobChange, startAction, ACTIONS } from "./actions.mjs";
import { linesSince, onLine, say } from "./log.mjs";
import { activity, appMemory, startActivity } from "./activity.mjs";
import { apkInfo, buildApk } from "./apk.mjs";
import { AppUnavailable, appJson, appTarget } from "./app-api.mjs";
import { machine } from "./machine.mjs";
import { serverOrder, setServerOrder } from "./settings.mjs";

const COOKIE = "pk_panel";
const SESSION_DAYS = 30;
const MAX_BODY = 4096;
const PAGE_FILE = new URL("./page.html", import.meta.url);

const log = (message, level) => say("panel", message, level);

const sha256 = (text) => createHash("sha256").update(text).digest();
const sameBytes = (a, b) => a.length === b.length && timingSafeEqual(a, b);

/** "/admin/" → "/admin"; "" or "/" → "" */
function normalizePath(path) {
  if (!path) return "";
  const clean = `/${path}`.replace(/\/+/g, "/").replace(/\/$/, "");
  return clean === "/" ? "" : clean;
}

const hostOf = (req) => String(req.headers.host || "").toLowerCase().replace(/:\d+$/, "").replace(/^\[|\]$/g, "");
const isHttps = (req) => req.socket.encrypted || req.headers["x-forwarded-proto"] === "https";
const clientIp = (req) => req.socket.remoteAddress || "?";

export function startPanel(server) {
  const password = process.env.PANEL_PASSWORD;
  const port = Number(process.env.PANEL_PORT || 3001);
  const bindHost = process.env.PANEL_HOST || "0.0.0.0";
  const basePath = normalizePath(process.env.PANEL_PATH);
  const hostname = (process.env.PANEL_HOSTNAME || "").toLowerCase();
  const frontDoor = Boolean(basePath || hostname);

  if (frontDoor && port === server.appPort) {
    log(`PANEL_PORT (${port}) es el mismo puerto que la app: arranca la app en otro (npm run serve -- -p 3000).`, "error");
    return null;
  }
  if (password.length < 8) log("PANEL_PASSWORD es muy corta: usa al menos 8 caracteres.", "error");

  const secret = sha256(`pk-panel\0${password}`);
  const passwordHash = sha256(password);
  const cookiePath = basePath || "/";

  // The scripts' token: long and random (npm run remote -- --setup makes one), or not accepted
  const apiToken = process.env.PANEL_API_TOKEN || "";
  if (apiToken && apiToken.length < 32) log("PANEL_API_TOKEN es muy corto (mínimo 32 caracteres): el acceso por token queda desactivado.", "error");
  const apiTokenHash = apiToken.length >= 32 ? sha256(apiToken) : null;

  /** The token in `Authorization: Bearer …`, or null without that header */
  function bearerOf(req) {
    const header = String(req.headers.authorization || "");
    return header.toLowerCase().startsWith("bearer ") ? header.slice(7).trim() : null;
  }

  // ---- sessions ---------------------------------------------------------------------------------

  const sign = (value) => createHmac("sha256", secret).update(value).digest("base64url");

  function newToken() {
    const expires = String(Date.now() + SESSION_DAYS * 86400_000);
    return `${expires}.${sign(expires)}`;
  }

  function signedIn(req) {
    const cookie = String(req.headers.cookie || "")
      .split(";")
      .map((part) => part.trim())
      .find((part) => part.startsWith(`${COOKIE}=`));
    if (!cookie) return false;
    const [expires, signature] = cookie.slice(COOKIE.length + 1).split(".");
    if (!expires || !signature || Number(expires) < Date.now()) return false;
    return sameBytes(Buffer.from(signature), Buffer.from(sign(expires)));
  }

  function sessionCookie(req, token, maxAge) {
    const secure = isHttps(req) ? "; Secure" : "";
    return `${COOKIE}=${token}; Path=${cookiePath}; Max-Age=${maxAge}; HttpOnly; SameSite=Strict${secure}`;
  }

  // Wrong passwords, per address: five tries, then a pause that doubles each time (up to an hour)
  const failures = new Map();
  function lockedFor(ip) {
    const entry = failures.get(ip);
    return entry && entry.until > Date.now() ? Math.ceil((entry.until - Date.now()) / 1000) : 0;
  }
  function failed(ip) {
    const entry = failures.get(ip) ?? { count: 0, until: 0 };
    entry.count += 1;
    if (entry.count >= 5) entry.until = Date.now() + Math.min(60_000 * 2 ** (entry.count - 5), 3600_000);
    failures.set(ip, entry);
  }

  // ---- responses --------------------------------------------------------------------------------

  const SECURITY_HEADERS = {
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "no-referrer",
  };

  function send(res, status, body, headers = {}) {
    const isJson = typeof body !== "string" && !Buffer.isBuffer(body);
    const payload = isJson ? JSON.stringify(body) : body;
    res.writeHead(status, {
      ...SECURITY_HEADERS,
      "Content-Type": isJson ? "application/json; charset=utf-8" : "text/plain; charset=utf-8",
      ...headers,
    });
    res.end(payload);
  }

  function readJson(req) {
    return new Promise((resolve) => {
      let size = 0;
      const chunks = [];
      req.on("data", (chunk) => {
        size += chunk.length;
        if (size > MAX_BODY) req.destroy();
        else chunks.push(chunk);
      });
      req.on("end", () => {
        try {
          resolve(JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}"));
        } catch {
          resolve({});
        }
      });
      req.on("error", () => resolve({}));
    });
  }

  /** A POST from another site carries its own Origin: refuse it (the cookie is SameSite already) */
  function sameOrigin(req) {
    const origin = req.headers.origin;
    if (!origin) return true;
    try {
      return new URL(origin).host.toLowerCase() === String(req.headers.host || "").toLowerCase();
    } catch {
      return false;
    }
  }

  // ---- state ------------------------------------------------------------------------------------

  async function state() {
    return {
      server: server.status(),
      git: await gitInfo(),
      ...jobState(),
      actions: Object.fromEntries(Object.entries(ACTIONS).map(([name, action]) => [name, action.title])),
    };
  }

  // Everyone watching the console: new lines, and a nudge to fetch the state again when it changes
  const streams = new Set();
  const broadcast = (chunk) => {
    for (const res of streams) res.write(chunk);
  };
  onLine((line) => broadcast(`id: ${line.id}\nevent: line\ndata: ${JSON.stringify(line)}\n\n`));
  let nudgeTimer = null;
  const nudge = () => {
    clearTimeout(nudgeTimer);
    nudgeTimer = setTimeout(() => broadcast("event: state\ndata: {}\n\n"), 150);
  };
  onJobChange(nudge);
  server.events.on("change", nudge);
  const heartbeat = setInterval(() => broadcast(": ping\n\n"), 20_000);
  const tracker = startActivity(server);

  function openStream(req, res, url) {
    const after = Number(req.headers["last-event-id"] || url.searchParams.get("after") || 0);
    res.writeHead(200, {
      ...SECURITY_HEADERS,
      "Content-Type": "text/event-stream; charset=utf-8",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });
    res.write("retry: 3000\n\n");
    const backlog = linesSince(after);
    if (backlog.length) {
      res.write(`id: ${backlog[backlog.length - 1].id}\nevent: lines\ndata: ${JSON.stringify(backlog)}\n\n`);
    }
    streams.add(res);
    req.on("close", () => streams.delete(res));
  }

  // ---- the panel's routes -----------------------------------------------------------------------

  async function handlePanel(req, res, url, path) {
    const method = req.method || "GET";

    if (path === "/" && method === "GET") {
      // Read on each request: the page is small and edits show up without a restart
      return send(res, 200, readFileSync(PAGE_FILE), {
        "Content-Type": "text/html; charset=utf-8",
        "Content-Security-Policy":
          "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; img-src 'self' data:; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
      });
    }
    if (path === "/icon.svg" && method === "GET") {
      try {
        return send(res, 200, readFileSync(join(ROOT, "app", "icon.svg")), { "Content-Type": "image/svg+xml" });
      } catch {
        return send(res, 404, "");
      }
    }

    if (path === "/api/login" && method === "POST") {
      if (!sameOrigin(req)) return send(res, 403, { error: "Origen no permitido" });
      const ip = clientIp(req);
      const wait = lockedFor(ip);
      if (wait) return send(res, 429, { error: `Demasiados intentos. Espera ${wait} s.`, retryAfter: wait });
      const body = await readJson(req);
      const given = typeof body.password === "string" ? body.password : "";
      if (!sameBytes(sha256(given), passwordHash)) {
        failed(ip);
        log(`Contraseña incorrecta desde ${ip}.`, "error");
        return send(res, 401, { error: "Contraseña incorrecta" });
      }
      failures.delete(ip);
      log(`Sesión iniciada desde ${ip}.`);
      return send(res, 200, { ok: true }, { "Set-Cookie": sessionCookie(req, newToken(), SESSION_DAYS * 86400) });
    }
    if (path === "/api/logout" && method === "POST") {
      return send(res, 200, { ok: true }, { "Set-Cookie": sessionCookie(req, "", 0) });
    }

    if (!path.startsWith("/api/")) return send(res, 404, "No encontrado");
    const token = bearerOf(req);
    if (token !== null) {
      const ip = clientIp(req);
      if (!apiTokenHash) return send(res, 401, { error: "Este panel no acepta tokens: falta PANEL_API_TOKEN en el servidor" });
      const wait = lockedFor(ip);
      if (wait) return send(res, 429, { error: `Demasiados intentos. Espera ${wait} s.`, retryAfter: wait });
      if (!sameBytes(sha256(token), apiTokenHash)) {
        failed(ip);
        log(`Token de API incorrecto desde ${ip}.`, "error");
        return send(res, 401, { error: "Token incorrecto" });
      }
      failures.delete(ip);
      if (method === "POST") log(`${path} pedido con el token de API desde ${ip}.`);
    } else if (!signedIn(req)) return send(res, 401, { error: "Inicia sesión" });

    if (path === "/api/state" && method === "GET") return send(res, 200, await state());
    if (path === "/api/events" && method === "GET") return openStream(req, res, url);

    if (path === "/api/activity" && method === "GET") return send(res, 200, activity());
    if (path === "/api/machine" && method === "GET") {
      return send(res, 200, machine({ appMemory: appMemory(), live: server.status().folder }));
    }
    if (path === "/api/log" && method === "GET") return sendLog(res, url);

    // Stream servers: the app's own health check (/api/status), run again on demand
    if (path === "/api/providers" && method === "GET") return proxyStatus(res, "/api/status?peek=1", 10_000);
    if (path === "/api/providers/check" && method === "POST") {
      if (!sameOrigin(req)) return send(res, 403, { error: "Origen no permitido" });
      log("Comprobando los servidores de vídeo…");
      return proxyStatus(res, "/api/status?refresh=1", 120_000);
    }

    // Order the server choice falls back to when language, security and connection tie
    if (path === "/api/server-order" && method === "GET") return send(res, 200, { order: serverOrder() });
    if (path === "/api/server-order" && method === "POST") {
      if (!sameOrigin(req)) return send(res, 403, { error: "Origen no permitido" });
      try {
        const order = setServerOrder((await readJson(req)).order);
        log(`Orden de servidores: ${order.join(", ")}.`);
        return send(res, 200, { order });
      } catch (error) {
        return send(res, 400, { error: error.message });
      }
    }

    if (path === "/api/rooms/close" && method === "POST") {
      if (!sameOrigin(req)) return send(res, 403, { error: "Origen no permitido" });
      const { code } = await readJson(req);
      if (typeof code !== "string" || !/^[A-Z0-9]{4,8}$/.test(code)) return send(res, 400, { error: "Código no válido" });
      try {
        const { status } = await appJson(server, "/api/internal/rooms", { method: "POST", body: { close: code } });
        if (status !== 200) return send(res, 404, { error: "Esa sala ya no existe" });
        log(`Sala ${code} cerrada desde el panel.`);
        return send(res, 200, { ok: true });
      } catch (error) {
        return send(res, 503, { error: error.message });
      }
    }

    if (path === "/api/apk" && method === "GET") {
      return send(res, 200, await apkInfo({ fresh: url.searchParams.get("fresh") === "1" }));
    }
    if (path === "/api/apk/build" && method === "POST") {
      if (!sameOrigin(req)) return send(res, 403, { error: "Origen no permitido" });
      try {
        const branch = (await gitInfo()).branch;
        const ref = branch && branch !== "HEAD" ? branch : "main";
        await buildApk(ref);
        log(`Compilación de la app de TV lanzada en GitHub (${ref}).`);
        return send(res, 202, { ok: true });
      } catch (error) {
        return send(res, 400, { error: error.message });
      }
    }

    const action = path.match(/^\/api\/action\/([a-z]+)$/)?.[1];
    if (action && method === "POST") {
      if (!sameOrigin(req)) return send(res, 403, { error: "Origen no permitido" });
      if (!ACTIONS[action]) return send(res, 404, { error: "Acción desconocida" });
      const result = startAction(action, server);
      if (!result.ok) return send(res, 409, { error: result.error });
      return send(res, 202, { job: result.job });
    }

    return send(res, 404, { error: "No encontrado" });
  }

  /** The app's health check, passed on as it is */
  async function proxyStatus(res, path, timeout) {
    try {
      const { status, data } = await appJson(server, path, { timeout });
      return send(res, status === 200 ? 200 : 502, data ?? { error: "Respuesta no válida del servidor" });
    } catch (error) {
      return send(res, error instanceof AppUnavailable ? 503 : 500, { error: error.message });
    }
  }

  /** The console as a text file; ?source=, ?errors=1 and ?q= narrow it like the page's filters */
  function sendLog(res, url) {
    const source = url.searchParams.get("source");
    const errorsOnly = url.searchParams.get("errors") === "1";
    const query = (url.searchParams.get("q") || "").toLowerCase();
    const pad = (n) => String(n).padStart(2, "0");
    const stamp = (ms) => {
      const d = new Date(ms);
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
    };
    const lines = linesSince(0)
      .filter((line) => !source || source === "all" || line.source === source || (source === "tarea" && line.source === "serve"))
      .filter((line) => !errorsOnly || line.level === "error")
      .filter((line) => !query || line.text.toLowerCase().includes(query))
      .map((line) => `${stamp(line.t)}  ${line.level === "error" ? "ERROR " : ""}[${line.source}] ${line.text}`);
    const now = new Date();
    const name = `pk-anime-consola-${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}.txt`;
    return send(res, 200, `${lines.join("\n")}\n`, {
      "Content-Type": "text/plain; charset=utf-8",
      "Content-Disposition": `attachment; filename="${name}"`,
    });
  }

  // ---- front door: everything that isn't the panel goes to the app ------------------------------

  const target = appTarget(server);

  function proxyToApp(req, res) {
    const headers = { ...req.headers };
    const forwardedFor = headers["x-forwarded-for"];
    headers["x-forwarded-for"] = forwardedFor ? `${forwardedFor}, ${clientIp(req)}` : clientIp(req);
    headers["x-forwarded-host"] ??= req.headers.host;
    headers["x-forwarded-proto"] ??= isHttps(req) ? "https" : "http";

    const upstream = httpRequest(
      { host: target, port: server.appPort, method: req.method, path: req.url, headers },
      (answer) => {
        res.writeHead(answer.statusCode || 502, answer.rawHeaders);
        answer.pipe(res);
      },
    );
    upstream.on("error", () => {
      if (res.headersSent) return res.destroy();
      const panelLink = basePath ? ` El panel sigue en ${basePath}/.` : "";
      send(res, 502, `PK Anime se está reiniciando o no está en marcha. Prueba en unos segundos.${panelLink}`, {
        "Retry-After": "5",
      });
    });
    // A visitor who leaves mid-video stops the request to the app too
    res.on("close", () => upstream.destroy());
    req.pipe(upstream);
  }

  // ---- the server -------------------------------------------------------------------------------

  const httpServer = createServer((req, res) => {
    let url;
    try {
      url = new URL(req.url || "/", "http://panel");
    } catch {
      return send(res, 400, "Petición no válida");
    }

    let path = url.pathname;
    let isPanel = !frontDoor;
    if (hostname && hostOf(req) === hostname) isPanel = true;
    else if (basePath) {
      if (path === basePath) {
        // Relative links in the page need the trailing slash
        res.writeHead(308, { Location: `${basePath}/${url.search}` });
        return res.end();
      }
      if (path.startsWith(`${basePath}/`)) {
        isPanel = true;
        path = path.slice(basePath.length);
      }
    }

    // The panel talks to /api/internal on the app's own port; from outside it doesn't exist
    if (!isPanel && path.startsWith("/api/internal")) return send(res, 404, "No encontrado");
    if (!isPanel) return proxyToApp(req, res);
    handlePanel(req, res, url, path).catch((error) => {
      log(`Error en el panel: ${error?.message ?? error}`, "error");
      if (!res.headersSent) send(res, 500, { error: "Error interno" });
    });
  });
  // Long downloads and streams through the front door must not be cut
  httpServer.requestTimeout = 0;
  httpServer.headersTimeout = 60_000;

  httpServer.on("error", (error) => {
    const reason = error.code === "EADDRINUSE" ? `el puerto ${port} ya está en uso` : error.message;
    log(`No se ha podido abrir el panel: ${reason}.`, "error");
  });
  httpServer.listen(port, bindHost, () => {
    const where = hostname
      ? `http://${hostname}${port === 80 ? "" : `:${port}`}/`
      : `http://<este equipo>${port === 80 ? "" : `:${port}`}${basePath}/`;
    log(`Panel de control en ${where}${frontDoor ? ` (el resto del puerto ${port} va a la app en ${server.appPort})` : ""}`);
  });

  return {
    close() {
      clearInterval(heartbeat);
      tracker.stop();
      for (const res of streams) res.end();
      httpServer.close();
    },
  };
}
