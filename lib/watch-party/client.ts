import { useEffect, useRef, useState } from "react";
import type { PartyState } from "./store";
import { activeProfile } from "@/lib/library/profiles";

/**
 * The browser side of "Ver juntos". Each device keeps its member ID per room in sessionStorage,
 * listens to the room's events, and applies them to the page's <video>; its own play, pause and
 * jumps go to the room. Changes made while applying someone else's are not sent back.
 */

const memberKey = (code: string) => `pk_party:${code}`;

function readMember(code: string) {
  try {
    return sessionStorage.getItem(memberKey(code));
  } catch {
    return null;
  }
}

function writeMember(code: string, member: string) {
  try {
    sessionStorage.setItem(memberKey(code), member);
  } catch {}
}

async function post(url: string, body: unknown) {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  return { status: res.status, data: await res.json().catch(() => ({})) };
}

/** How this device shows up to the others in a room: its profile, else the account, else the device */
export function deviceName(accountName: string | null | undefined, isTv: boolean) {
  const profile = activeProfile();
  if (profile.id !== "main") return profile.name;
  return accountName || (isTv ? "La TV" : "Alguien");
}

export const watchHref = (state: Pick<PartyState, "animeId" | "episode" | "audio">, code: string) =>
  `/watch/${state.animeId}/${state.episode}?audio=${state.audio}&party=${code}`;

/** Opens a room for this episode; returns its code */
export async function startParty(animeId: number, episode: number, audio: "sub" | "dub", name: string) {
  const { data } = await post("/api/party", { animeId, episode, audio, name });
  if (!data.success) throw new Error(data.error || "No se pudo crear la sala");
  writeMember(data.code, data.member);
  return data.code as string;
}

/** Joins a room by its code; returns where it is, or why it couldn't */
export async function joinPartyByCode(code: string, name: string): Promise<{ state: PartyState; code: string } | { error: string }> {
  const { data } = await post("/api/party/join", { code, name });
  if (!data.success) {
    return { error: data.code === "UNKNOWN_ROOM" ? "No hay ninguna sala con ese código." : data.code === "ROOM_FULL" ? "La sala está llena." : "No se pudo entrar en la sala." };
  }
  writeMember(data.code, data.member);
  return { state: data.state, code: data.code };
}

/** Changes made locally are ignored this long after applying someone else's */
const APPLY_QUIET_MS = 1200;
/** Local events right after the player starts (autoplay, resuming a saved position) aren't news */
const SETTLE_MS = 2500;
/** Out of sync by more than this, the player jumps */
const MAX_DRIFT_S = 1.5;
const DRIFT_CHECK_MS = 10_000;

export interface PartyStatus {
  names: string[];
  /** "Ana ha pausado", for a moment */
  notice: string | null;
  /** The room was closed or the server restarted */
  gone: boolean;
}

/**
 * Keeps this page's player in sync with the room. `follow` moves to another episode when someone
 * else does; when this page is the one that moved, the room follows it instead.
 */
export function usePartySync({
  code,
  animeId,
  episode,
  audio,
  name,
  follow,
}: {
  code: string | null;
  animeId: number;
  episode: number;
  audio: "sub" | "dub";
  name: string;
  follow: (href: string) => void;
}): PartyStatus | null {
  const [status, setStatus] = useState<PartyStatus>({ names: [], notice: null, gone: false });
  const followRef = useRef(follow);
  followRef.current = follow;

  useEffect(() => {
    if (!code) return;
    let cancelled = false;
    let source: EventSource | null = null;
    let member = readMember(code);
    let offset = 0;
    let latest: PartyState | null = null;
    let first = true;
    let quietUntil = Date.now() + SETTLE_MS;
    let video: HTMLVideoElement | null = null;
    let noticeTimer: ReturnType<typeof setTimeout> | undefined;

    const expectedPosition = (s: PartyState) => s.position + (s.playing ? Math.max(0, Date.now() - offset - s.at) / 1000 : 0);

    const apply = () => {
      if (!latest || !video || video.readyState < 1) return;
      const s = latest;
      quietUntil = Math.max(quietUntil, Date.now() + APPLY_QUIET_MS);
      const target = expectedPosition(s);
      if (Math.abs(video.currentTime - target) > MAX_DRIFT_S) video.currentTime = target;
      if (s.playing && video.paused) video.play().catch(() => {});
      if (!s.playing && !video.paused) video.pause();
    };

    const send = (changes: Partial<PartyState>) => {
      if (!member) return;
      latest = latest ? { ...latest, ...changes, at: Date.now() - offset } : latest;
      post("/api/party/state", { code, member, ...changes }).catch(() => {});
    };

    const notify = (text: string) => {
      setStatus((s) => ({ ...s, notice: text }));
      clearTimeout(noticeTimer);
      noticeTimer = setTimeout(() => setStatus((s) => ({ ...s, notice: null })), 3500);
    };

    // Local changes go to the room
    const onPlay = () => Date.now() > quietUntil && video && send({ playing: true, position: video.currentTime });
    const onPause = () => Date.now() > quietUntil && video && !video.ended && send({ playing: false, position: video.currentTime });
    const onSeeked = () => Date.now() > quietUntil && video && send({ playing: !video.paused, position: video.currentTime });
    const onReady = () => apply();

    const bind = (next: HTMLVideoElement | null) => {
      if (next === video) return;
      if (video) {
        video.removeEventListener("play", onPlay);
        video.removeEventListener("pause", onPause);
        video.removeEventListener("seeked", onSeeked);
        video.removeEventListener("loadedmetadata", onReady);
      }
      video = next;
      if (!video) return;
      video.addEventListener("play", onPlay);
      video.addEventListener("pause", onPause);
      video.addEventListener("seeked", onSeeked);
      video.addEventListener("loadedmetadata", onReady);
      quietUntil = Date.now() + SETTLE_MS;
      apply();
    };
    // The player creates its <video> after loading, and may replace it when changing server
    const finder = setInterval(() => bind(document.querySelector("video")), 700);
    const drift = setInterval(() => {
      if (latest?.playing && video && !video.paused && Math.abs(video.currentTime - expectedPosition(latest)) > MAX_DRIFT_S * 2) apply();
    }, DRIFT_CHECK_MS);

    const connect = () => {
      source = new EventSource(`/api/party/events?code=${encodeURIComponent(code)}&member=${encodeURIComponent(member!)}`);
      source.onmessage = (e) => {
        let event: any;
        try {
          event = JSON.parse(e.data);
        } catch {
          return;
        }
        if (event.type === "members") setStatus((s) => ({ ...s, names: event.names }));
        if (event.type !== "state") return;
        offset = Date.now() - event.serverNow;
        const s = event.state as PartyState;
        if (s.animeId !== animeId || s.episode !== episode) {
          // This page moved on by itself (the next episode): the room comes along. Otherwise
          // someone else did, and this page follows
          if (first) {
            latest = { ...s, animeId, episode, audio, playing: true, position: 0 };
            send({ episode, audio, playing: true, position: 0 });
          } else {
            followRef.current(watchHref(s, code));
          }
          first = false;
          return;
        }
        if (!first && s.by) notify(`${s.by} ${s.playing ? (latest?.playing ? "ha saltado a otro momento" : "ha reanudado") : "ha pausado"}`);
        first = false;
        latest = s;
        apply();
      };
      // A room the server no longer has (closed, or a restart) answers 404 and EventSource gives up
      source.onerror = () => {
        if (source?.readyState === EventSource.CLOSED && !cancelled) setStatus((st) => ({ ...st, gone: true }));
      };
    };

    (async () => {
      if (!member) {
        const joined = await joinPartyByCode(code, name);
        if (cancelled) return;
        if ("error" in joined) return setStatus((s) => ({ ...s, gone: true }));
        member = readMember(code);
      }
      connect();
    })();

    return () => {
      cancelled = true;
      source?.close();
      clearInterval(finder);
      clearInterval(drift);
      clearTimeout(noticeTimer);
      bind(null);
    };
    // One connection per room and episode page; the name is read when joining
  }, [code, animeId, episode]);

  return code ? status : null;
}
