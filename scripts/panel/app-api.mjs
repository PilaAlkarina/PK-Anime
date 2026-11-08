/**
 * Requests from the panel to the app it supervises, on this machine. /api/internal/* needs the
 * token `npm run serve` gave the app when it started it (see lib/internal-auth.ts).
 */
import { request as httpRequest } from "node:http";

const TOKEN_HEADER = "x-pk-panel-token";

export class AppUnavailable extends Error {}

/** Where the app listens, seen from here */
export const appTarget = (server) =>
  !server.appHost || ["0.0.0.0", "::", "[::]"].includes(server.appHost) ? "127.0.0.1" : server.appHost;

/** JSON from the app; throws AppUnavailable when it isn't answering */
export function appJson(server, path, { method = "GET", body, timeout = 10_000 } = {}) {
  return new Promise((resolve, reject) => {
    const payload = body === undefined ? null : Buffer.from(JSON.stringify(body));
    const req = httpRequest(
      {
        host: appTarget(server),
        port: server.appPort,
        method,
        path,
        headers: {
          [TOKEN_HEADER]: server.internalToken,
          Accept: "application/json",
          ...(payload ? { "Content-Type": "application/json", "Content-Length": payload.length } : {}),
        },
        timeout,
      },
      (res) => {
        const chunks = [];
        res.on("data", (chunk) => chunks.push(chunk));
        res.on("end", () => {
          const text = Buffer.concat(chunks).toString("utf8");
          let data = null;
          try {
            data = JSON.parse(text);
          } catch {}
          if (res.statusCode === 404 && !data) {
            return reject(new AppUnavailable("La versión del servidor en marcha no tiene esta función: actualiza o recompila."));
          }
          resolve({ status: res.statusCode, data });
        });
      },
    );
    req.on("timeout", () => req.destroy(new AppUnavailable("El servidor no responde a tiempo.")));
    req.on("error", (error) =>
      reject(error instanceof AppUnavailable ? error : new AppUnavailable("PK Anime no está respondiendo (¿reiniciándose?).")),
    );
    req.end(payload);
  });
}
