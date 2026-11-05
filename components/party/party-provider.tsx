"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAccount } from "@/lib/library/account";
import { useIsTv } from "@/components/ui-mode";
import {
  deviceName,
  joinError,
  partyPost,
  pickHref,
  readMembership,
  writeMembership,
  type Membership,
  type PartySnapshot,
} from "@/lib/watch-party/client";
import { LobbyOverlay, MismatchDialog, PartyFab, PartyNotice, TvPartyBadge, WatchPartyBadge } from "./party-ui";

/**
 * "Ver juntos" for the whole library. The room lives here, not on a page: its host browses as
 * usual, and opening an episode picks it for everyone, who are taken to it. Each pick starts
 * in a lobby: the player is held at 0:00 until every device has loaded the episode, then all
 * start at once. While watching, anyone's pause, play or jump goes to the rest. A member other
 * than the host who opens another episode is asked to leave the room first.
 *
 * The page's <video> is driven from here, so the player knows nothing about rooms.
 */

interface PartyApi {
  party: PartySnapshot | null;
  /** This device's public ID in the room */
  you: string | null;
  isHost: boolean;
  /** Creates a room with this device as host; null or an error message */
  create: () => Promise<string | null>;
  join: (code: string) => Promise<string | null>;
  leave: () => void;
  startNow: () => void;
}

const PartyContext = createContext<PartyApi>({
  party: null,
  you: null,
  isHost: false,
  create: async () => null,
  join: async () => null,
  leave: () => {},
  startNow: () => {},
});

export const useParty = () => useContext(PartyContext);

/** Sent by the phone remote through the TV link (see tv-link.tsx) */
export const PARTY_COMMAND_EVENT = "pk:party-command";

const WATCH_PATH = /^\/watch\/(\d+)\/(\d+)/;
/** Local changes are ignored this long after applying the room's */
const QUIET_MS = 1200;
const MAX_DRIFT_S = 1.5;
const DRIFT_CHECK_MS = 10_000;
/** The next episode played on by itself here: the host's player is about to pick it too */
const NEXT_EPISODE_GRACE_MS = 10_000;
const NOTICE_MS = 3500;

function watchTarget(pathname: string) {
  const m = WATCH_PATH.exec(pathname);
  return m ? { animeId: Number(m[1]), episode: Number(m[2]) } : null;
}

const currentAudio = () => (new URLSearchParams(window.location.search).get("audio") === "dub" ? "dub" : "sub");

export function PartyProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const isTv = useIsTv();
  const account = useAccount();
  const [membership, setMembership] = useState<Membership | null>(null);
  const [party, setParty] = useState<PartySnapshot | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [mismatch, setMismatch] = useState(false);
  const [reconnect, setReconnect] = useState(0);
  const partyRef = useRef<PartySnapshot | null>(null);
  const offsetRef = useRef(0);
  const noticeTimer = useRef<ReturnType<typeof setTimeout>>();
  // Lets the video code react to each new snapshot
  const onSnapshotRef = useRef<() => void>(() => {});

  useEffect(() => setMembership(readMembership()), []);

  const notify = useCallback((text: string) => {
    setNotice(text);
    clearTimeout(noticeTimer.current);
    noticeTimer.current = setTimeout(() => setNotice(null), NOTICE_MS);
  }, []);

  const drop = useCallback((message?: string) => {
    writeMembership(null);
    setMembership(null);
    setParty(null);
    partyRef.current = null;
    if (message) notify(message);
  }, [notify]);

  const you = membership?.you ?? null;
  const isHost = !!party?.members.some((m) => m.id === you && m.host);
  const name = () => deviceName(account?.user?.name, isTv);

  // --- Connection ---
  useEffect(() => {
    if (!membership) return;
    let closed = false;
    const source = new EventSource(
      `/api/party/events?code=${encodeURIComponent(membership.code)}&member=${encodeURIComponent(membership.member)}`
    );
    source.onmessage = (e) => {
      let event: any;
      try {
        event = JSON.parse(e.data);
      } catch {
        return;
      }
      if (event.type === "closed") {
        closed = true;
        source.close();
        drop("Has salido de la sala");
        return;
      }
      if (event.type !== "snapshot") return;
      offsetRef.current = Date.now() - event.serverNow;
      const next = event.party as PartySnapshot;
      const prev = partyRef.current;
      if (prev) {
        // Who joined, left, paused…
        const before = new Set(prev.members.filter((m) => m.connected).map((m) => m.id));
        const after = new Set(next.members.filter((m) => m.connected).map((m) => m.id));
        const joined = next.members.find((m) => m.connected && !before.has(m.id) && m.id !== membership.you);
        const left = prev.members.find((m) => before.has(m.id) && !after.has(m.id) && m.id !== membership.you);
        if (joined) notify(`${joined.name} se ha unido a la sala`);
        else if (left) notify(`${left.name} ha salido de la sala`);
        else if (
          next.state.phase === "playing" &&
          prev.state.phase === "playing" &&
          next.state.at !== prev.state.at &&
          next.state.by &&
          next.state.by !== name()
        ) {
          notify(`${next.state.by} ${next.state.playing ? (prev.state.playing ? "ha saltado a otro momento" : "ha reanudado") : "ha pausado"}`);
        }
      }
      partyRef.current = next;
      setParty(next);
      onSnapshotRef.current();
    };
    // EventSource gives up on a 404 (a room the server no longer has) but also when the page
    // unloads or the network drops: the server says which, and a live room is reconnected to
    const onHide = () => (closed = true);
    window.addEventListener("pagehide", onHide);
    let retry: ReturnType<typeof setTimeout> | undefined;
    source.onerror = async () => {
      if (closed || source.readyState !== EventSource.CLOSED) return;
      const { status, data } = await partyPost("/state", { code: membership.code, member: membership.member });
      if (closed) return;
      if (status === 404 || data.code === "NOT_A_MEMBER") drop("La sala ya no existe");
      else retry = setTimeout(() => setReconnect((n) => n + 1), 3000);
    };
    return () => {
      closed = true;
      clearTimeout(retry);
      window.removeEventListener("pagehide", onHide);
      source.close();
    };
    // `name` and `notify` only matter when an event arrives
  }, [membership, drop, reconnect]);

  // --- Actions ---
  const adopt = (data: any) => {
    justJoinedRef.current = true;
    followedRef.current = undefined;
    const m: Membership = { code: data.code, member: data.member, you: data.you };
    writeMembership(m);
    partyRef.current = data.party;
    setParty(data.party);
    setMembership(m);
  };

  const create = useCallback(async () => {
    const { data } = await partyPost("", { name: name() });
    if (!data.success) return "No se pudo crear la sala.";
    adopt(data);
    notify(`Sala ${data.code} creada: elige un episodio`);
    return null;
  }, [account, isTv]);

  const join = useCallback(async (code: string) => {
    if (membership) await partyPost("/leave", { code: membership.code, member: membership.member });
    const { data } = await partyPost("/join", { code, name: name() });
    if (!data.success) return joinError(data.code);
    adopt(data);
    return null;
  }, [account, isTv, membership]);

  const leave = useCallback(() => {
    if (!membership) return;
    partyPost("/leave", { code: membership.code, member: membership.member });
    drop("Has salido de la sala");
    setMismatch(false);
  }, [membership, drop]);

  const startNow = useCallback(() => {
    if (membership) partyPost("/start", { code: membership.code, member: membership.member });
  }, [membership]);

  // The phone remote can create, join or leave a room for the TV
  useEffect(() => {
    const onCommand = async (e: Event) => {
      const { action, code } = (e as CustomEvent).detail || {};
      if (action === "create") {
        const error = await create();
        if (error) notify(error);
      } else if (action === "join" && typeof code === "string") {
        const error = await join(code);
        notify(error ?? `Te has unido a la sala ${code.toUpperCase()}`);
      } else if (action === "leave") leave();
    };
    window.addEventListener(PARTY_COMMAND_EVENT, onCommand);
    return () => window.removeEventListener(PARTY_COMMAND_EVENT, onCommand);
  }, [create, join, leave, notify]);

  // --- The pick: everyone goes there ---
  const state = party?.state;
  const pickKey = state && state.phase !== "idle" ? `${state.animeId}:${state.episode}` : null;
  const target = watchTarget(pathname);
  const onPick = !!target && !!state && state.phase !== "idle" && target.animeId === state.animeId && target.episode === state.episode;

  // Undefined until the first snapshot: on a reload the room's current pick is taken as seen
  // (whoever is elsewhere gets the dialog or stays put); right after joining, it's followed
  const followedRef = useRef<string | null | undefined>(undefined);
  const justJoinedRef = useRef(false);
  useEffect(() => {
    if (!state) return;
    if (followedRef.current === undefined) {
      if (!justJoinedRef.current) {
        followedRef.current = pickKey;
        return;
      }
      justJoinedRef.current = false;
      followedRef.current = null;
    }
    if (!pickKey || followedRef.current === pickKey) return;
    followedRef.current = pickKey;
    if (!onPick) router.push(pickHref(state));
    // Only when the pick changes: someone who left the player isn't dragged back on every pause
  }, [pickKey, state === undefined]);

  // The host opening an episode picks it for everyone
  const pickedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!membership || !isHost || !target) return;
    if (onPick) return;
    const key = `${target.animeId}:${target.episode}`;
    if (pickedRef.current === key) return;
    pickedRef.current = key;
    followedRef.current = key;
    partyPost("/select", { code: membership.code, member: membership.member, ...target, audio: currentAudio() });
  }, [membership, isHost, target?.animeId, target?.episode, onPick]);

  // Anyone else opening an episode that isn't the pick is asked to leave the room first; the next
  // episode the player moves on to by itself gets a moment, as the host's is about to pick it too
  useEffect(() => {
    setMismatch(false);
    if (!membership || !party || isHost || !target || onPick) return;
    const s = party.state;
    const nextOfPick = s.phase === "playing" && target.animeId === s.animeId && target.episode === (s.episode ?? 0) + 1;
    if (!nextOfPick) return setMismatch(true);
    const timer = setTimeout(() => setMismatch(true), NEXT_EPISODE_GRACE_MS);
    return () => clearTimeout(timer);
  }, [membership, isHost, pathname, onPick, party?.state.animeId, party?.state.episode, party?.state.phase]);

  // --- The player ---
  useEffect(() => {
    if (!membership || (!onPick && !mismatch)) return;
    let video: HTMLVideoElement | null = null;
    let quietUntil = 0;
    let readySent = false;
    let startTimer: ReturnType<typeof setTimeout> | undefined;

    const now = () => Date.now() - offsetRef.current;
    const expected = () => {
      const s = partyRef.current!.state;
      return s.position + (s.playing ? Math.max(0, now() - s.at) / 1000 : 0);
    };
    const quiet = () => (quietUntil = Date.now() + QUIET_MS);

    const hold = () => {
      if (!video) return;
      quiet();
      if (!video.paused) video.pause();
      if (video.currentTime > 0.5) video.currentTime = 0;
    };

    const apply = () => {
      const s = partyRef.current?.state;
      if (!video || !s) return;
      clearTimeout(startTimer);
      // Another episode open by mistake: kept paused while the dialog asks
      if (mismatch || s.phase === "lobby") return hold();
      if (s.phase !== "playing") return;
      if (s.playing && s.at > now()) {
        // Everyone ready: all start at the same moment
        hold();
        startTimer = setTimeout(apply, s.at - now());
        return;
      }
      if (video.readyState < 1) return;
      quiet();
      const position = expected();
      if (Math.abs(video.currentTime - position) > MAX_DRIFT_S) video.currentTime = position;
      if (s.playing && video.paused) video.play().catch(() => {});
      if (!s.playing && !video.paused) video.pause();
    };
    onSnapshotRef.current = apply;

    const send = (changes: { playing?: boolean; position?: number }) => {
      const s = partyRef.current?.state;
      if (!s || s.phase !== "playing" || Date.now() < quietUntil || mismatch) return;
      partyPost("/state", { code: membership.code, member: membership.member, ...changes });
    };
    const onPlay = () => {
      const s = partyRef.current?.state;
      // The player starts by itself; in the lobby it waits for the others
      if (s?.phase === "lobby" || mismatch || (s?.playing && s.at > now())) return hold();
      if (video) send({ playing: true, position: video.currentTime });
    };
    const onPause = () => video && !video.ended && send({ playing: false, position: video.currentTime });
    const onSeeked = () => video && send({ playing: !video.paused, position: video.currentTime });

    const bind = (next: HTMLVideoElement | null) => {
      if (next === video) return;
      if (video) {
        video.removeEventListener("play", onPlay);
        video.removeEventListener("pause", onPause);
        video.removeEventListener("seeked", onSeeked);
        video.removeEventListener("loadedmetadata", apply);
      }
      video = next;
      if (!video) return;
      video.addEventListener("play", onPlay);
      video.addEventListener("pause", onPause);
      video.addEventListener("seeked", onSeeked);
      video.addEventListener("loadedmetadata", apply);
      apply();
    };

    // The player makes its <video> after loading, and may replace it when changing server
    const finder = setInterval(() => {
      bind(document.querySelector("video"));
      // Loaded enough to play: this device is ready for the lobby
      const s = partyRef.current?.state;
      if (!readySent && onPick && video && video.readyState >= 3 && s) {
        readySent = true;
        partyPost("/ready", { code: membership.code, member: membership.member, animeId: s.animeId, episode: s.episode });
      }
      if (s?.phase === "lobby" && video && !video.paused) hold();
    }, 500);
    const drift = setInterval(() => {
      const s = partyRef.current?.state;
      if (s?.phase === "playing" && s.playing && video && !video.paused && Math.abs(video.currentTime - expected()) > MAX_DRIFT_S * 2) apply();
    }, DRIFT_CHECK_MS);

    return () => {
      clearInterval(finder);
      clearInterval(drift);
      clearTimeout(startTimer);
      onSnapshotRef.current = () => {};
      bind(null);
    };
  }, [membership, onPick, mismatch, pickKey]);

  // The lobby overlay goes away at the start time everyone was given
  const [, rerender] = useState(0);
  useEffect(() => {
    if (state?.phase !== "playing" || !state.playing) return;
    const wait = state.at - (Date.now() - offsetRef.current);
    if (wait <= 0) return;
    const timer = setTimeout(() => rerender((n) => n + 1), wait + 50);
    return () => clearTimeout(timer);
  }, [state?.phase, state?.playing, state?.at]);

  const api = useMemo<PartyApi>(
    () => ({ party, you, isHost, create, join, leave, startNow }),
    [party, you, isHost, create, join, leave, startNow]
  );

  const host = party?.members.find((m) => m.host) ?? null;
  const lobby =
    onPick && !!state && (state.phase === "lobby" || (state.phase === "playing" && state.playing && state.at > Date.now() - offsetRef.current));

  return (
    <PartyContext.Provider value={api}>
      {children}
      {party && !target && (isTv ? <TvPartyBadge party={party} /> : null)}
      {!isTv && !target && <PartyFab />}
      {party && onPick && !lobby && <WatchPartyBadge party={party} />}
      {party && lobby && <LobbyOverlay party={party} isHost={isHost} onStart={startNow} starting={state!.phase === "playing"} />}
      {party && mismatch && host && (
        <MismatchDialog
          hostName={host.name}
          onLeave={leave}
          onBack={() => {
            setMismatch(false);
            if (party.state.phase !== "idle") router.replace(pickHref(party.state));
            else router.back();
          }}
        />
      )}
      {notice && <PartyNotice text={notice} />}
    </PartyContext.Provider>
  );
}
