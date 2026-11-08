/**
 * The Fire TV / Android TV app: its latest release on GitHub, the last runs of the workflow that
 * builds it (.github/workflows/android-tv.yml) and, with PANEL_GITHUB_TOKEN, a button to start one.
 * Reading works without a token on a public repository (GitHub allows 60 requests an hour per
 * address that way); starting a build needs a token with Actions: read and write on the repository.
 */
import { execFile } from "node:child_process";
import { ROOT } from "../build-slots.mjs";

const WORKFLOW = "android-tv.yml";
const ASSET = "pk-anime-tv.apk";
const TAG_PREFIX = "tv-v";
const CACHE_MS = 60_000;
/** While a build runs, the panel looks again sooner */
const BUSY_CACHE_MS = 10_000;

let repoCache = null;

/** "owner/name" of the origin remote on GitHub, or null */
function repository() {
  if (repoCache !== null) return Promise.resolve(repoCache);
  return new Promise((resolve) => {
    execFile("git", ["remote", "get-url", "origin"], { cwd: ROOT, windowsHide: true }, (error, stdout) => {
      const match = !error && stdout.trim().match(/github\.com[:/]([^/\s]+)\/([^/\s]+?)(?:\.git)?$/);
      repoCache = match ? `${match[1]}/${match[2]}` : "";
      resolve(repoCache || null);
    });
  });
}

const token = () => process.env.PANEL_GITHUB_TOKEN || "";

async function github(path, { method = "GET", body } = {}) {
  const headers = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "pk-anime-panel",
  };
  if (token()) headers.Authorization = `Bearer ${token()}`;
  if (body) headers["Content-Type"] = "application/json";
  const res = await fetch(`https://api.github.com${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    const reason =
      res.status === 403 && res.headers.get("x-ratelimit-remaining") === "0"
        ? "GitHub ha limitado las consultas sin token: pon PANEL_GITHUB_TOKEN o espera un rato"
        : res.status === 401
          ? "PANEL_GITHUB_TOKEN no es válido o ha caducado"
          : res.status === 403 || res.status === 404
            ? `El token no tiene permiso (Actions: read and write en el repositorio)${data.message ? ` · ${data.message}` : ""}`
            : data.message || `HTTP ${res.status}`;
    const error = new Error(reason);
    error.status = res.status;
    throw error;
  }
  return res.status === 204 ? null : res.json();
}

let cache = { at: 0, value: null, ttl: CACHE_MS };

async function load() {
  const repo = await repository();
  if (!repo) return { repo: null, error: "El repositorio no está en GitHub (git remote origin)." };

  const [releases, runs] = await Promise.all([
    github(`/repos/${repo}/releases?per_page=15`),
    github(`/repos/${repo}/actions/workflows/${WORKFLOW}/runs?per_page=6`).catch((error) =>
      error.status === 404 ? { workflow_runs: [], missing: true } : Promise.reject(error),
    ),
  ]);

  const release = releases.find((r) => r.tag_name?.startsWith(TAG_PREFIX) && !r.draft);
  const asset = release?.assets?.find((a) => a.name === ASSET);
  return {
    repo,
    canBuild: Boolean(token()),
    workflowMissing: Boolean(runs.missing),
    downloadUrl: `https://github.com/${repo}/releases/latest/download/${ASSET}`,
    actionsUrl: `https://github.com/${repo}/actions/workflows/${WORKFLOW}`,
    release: release
      ? {
          tag: release.tag_name,
          version: release.tag_name.slice(TAG_PREFIX.length),
          publishedAt: release.published_at,
          url: release.html_url,
          size: asset?.size ?? null,
          downloads: asset?.download_count ?? null,
          assetUrl: asset?.browser_download_url ?? null,
        }
      : null,
    runs: (runs.workflow_runs ?? []).map((run) => ({
      id: run.id,
      status: run.status,
      conclusion: run.conclusion,
      event: run.event,
      title: run.display_title,
      commit: run.head_sha?.slice(0, 7),
      createdAt: run.created_at,
      updatedAt: run.updated_at,
      url: run.html_url,
    })),
  };
}

/** The release and recent builds, cached for a minute (ten seconds while a build runs) */
export async function apkInfo({ fresh = false } = {}) {
  if (!fresh && cache.value && Date.now() - cache.at < cache.ttl) return cache.value;
  try {
    const value = await load();
    const busy = value.runs?.some((run) => run.status !== "completed");
    cache = { at: Date.now(), value: { ...value, checkedAt: Date.now() }, ttl: busy ? BUSY_CACHE_MS : CACHE_MS };
  } catch (error) {
    const repo = await repository();
    cache = {
      at: Date.now(),
      ttl: 30_000,
      value: { repo, canBuild: Boolean(token()), error: error.message, checkedAt: Date.now(), ...(cache.value ? { stale: cache.value } : {}) },
    };
  }
  return cache.value;
}

/** Starts the workflow on `ref`; needs PANEL_GITHUB_TOKEN */
export async function buildApk(ref) {
  if (!token()) throw new Error("Falta PANEL_GITHUB_TOKEN en .env.local para lanzar compilaciones.");
  const repo = await repository();
  if (!repo) throw new Error("El repositorio no está en GitHub.");
  await github(`/repos/${repo}/actions/workflows/${WORKFLOW}/dispatches`, { method: "POST", body: { ref: ref || "main" } });
  // GitHub takes a moment to list the new run
  cache.at = 0;
  cache.ttl = BUSY_CACHE_MS;
}
