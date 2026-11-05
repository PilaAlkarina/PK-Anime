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
import { LobbyOverlay, MismatchDialog, PartyFab, PartyNotice, SyncBadge, TvPartyBadge, WatchPartyBadge } from "./party-ui";

/**
 * "Ver juntos" for the whole library. The room lives here, not on a page: its host browses as
 * usual, and opening an episode picks it for everyone, who are taken to it. A member other than
 * the host who opens another episode is asked to leave the room first.
 *
 * Playback goes through the server's barriers (see lib/watch-party/store.ts): a pick, a pause, the
 * host's jump, a resume or a player out of buffer pauses everyone; each device says where it
 * stopped, goes to the agreed spot, says when it has it buffered, and all start together at a
 * time given in advance. The player asks the room instead of acting (its `sync` prop, from the
 * watch screen), and this drives the page's <video> to follow the room.
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
  /** The player's play, pause and jump, asked of the room */
  requestPlay: () => void;
  requestPause: (position: number) => void;
  requestSeek: (target: number) => void;
}

const noop = () => {};
const PartyContext = createContext<PartyApi>({
  party: null,
  you: null,
  isHost: false,
  create: async () => null,
  join: async () => null,
  leave: noop,
  startNow: noop,
  requestPlay: noop,
  requestPause: noop,
  requestSeek: noop,
});

export const useParty = () => useContext(PartyContext);

/** Sent by the phone remote through the TV link (see tv-link.tsx) */
export const PARTY_COMMAND_EVENT = "pk:party-command";

const WATCH_PATH = /^\/watch\/(\d+)\/(\d+)/;
/** Out of step by more than this while playing, the player jumps to the room's position */
const MAX_DRIFT_S = 3;
const DRIFT_CHECK_MS = 5000;
/** Out of buffer this long while playing: everyone waits for this device */
const STALL_MS = 2000;
/** The next episode played on by itself here: the host's player is about to pick it too */
const NEXT_EPISODE_GRACE_MS = 10_000;
const NOTICE_MS = 3500;
const CLOCK_SAMPLES = 4;

function watchTarget(pathname: string) {
  const m = WATCH_PATH.exec(pathname);
  return m ? { animeId: Number(m[1]), episode: Number(m[2]) } : null;
}

const currentAudio = () => (new URLSearchParams(window.location.search).get("audio") === "dub" ? "dub" : "sub");

/**
 * This device's clock minus the server's, from a few round trips: the one with the shortest trip
 * is the best estimate (half the trip each way)
 */
async function measureClockOffset(): Promise<number | null> {
  let best: { rtt: number; offset: number } | null = null;
  for (let i = 0; i < CLOCK_SAMPLES; i++) {
    const sent = Date.now();
    const data = await fetch("/api/party/clock", { cache: "no-store" })
      .then((r) => r.json())
      .catch(() => null);
    const received = Date.now();
    if (!data?.now) continue;
    const rtt = received - sent;
    const offset = (sent + received) / 2 - data.now;
    if (!best || rtt < best.rtt) best = { rtt, offset };
  }
  return best?.offset ?? null;
}

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
  const membershipRef = useRef<Membership | null>(null);
  membershipRef.current = membership;
  /** Device clock minus server clock, ms */
  const offsetRef = useRef(0);
  const clockMeasured = useRef(false);
  const noticeTimer = useRef<ReturnType<typeof setTimeout>>();
  // Lets the player code react to each new snapshot
  const onSnapshotRef = useRef<() => void>(noop);

  useEffect(() => setMembership(readMembership()), []);

  const serverNow = () => Date.now() - offsetRef.current;

  const notify = useCallback((text: string) => {
    setNotice(text);
    clearTimeout(noticeTimer.current);
    noticeTimer.current = setTimeout(() => setNotice(null), NOTICE_MS);
  }, []);

  const drop = useCallback(
    (message?: string) => {
      writeMembership(null);
      setMembership(null);
      setParty(null);
      partyRef.current = null;
      if (message) notify(message);
    },
    [notify]
  );

  const you = membership?.you ?? null;
  const isHost = !!party?.members.some((m) => m.id === you && m.host);
  const name = () => deviceName(account?.user?.name, isTv);

  // --- Connection ---
  useEffect(() => {
    if (!membership) return;
    let closed = false;
    if (!clockMeasured.current) {
      clockMeasured.current = true;
      measureClockOffset().then((offset) => offset !== null && (offsetRef.current = offset));
    }
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
      // The stream's own time is a rough fallback until the round-trip estimate is in
      if (!clockMeasured.current) offsetRef.current = Date.now() - event.serverNow;
      const next = event.party as PartySnapshot;
      const prev = partyRef.current;
      if (prev) {
        const before = new Set(prev.members.filter((m) => m.connected).map((m) => m.id));
        const after = new Set(next.members.filter((m) => m.connected).map((m) => m.id));
        const joined = next.members.find((m) => m.connected && !before.has(m.id) && m.id !== membership.you);
        const left = prev.members.find((m) => before.has(m.id) && !after.has(m.id) && m.id !== membership.you);
        const barrier = next.state.barrier;
        if (joined) notify(`${joined.name} se ha unido a la sala`);
        else if (left) notify(`${left.name} ha salido de la sala`);
        else if (barrier && barrier.id !== prev.state.barrier?.id && barrier.by !== name()) {
          if (barrier.kind === "pause") notify(`${barrier.by} ha pausado`);
          else if (barrier.kind === "seek") notify(`${barrier.by} ha movido el episodio`);
          else if (barrier.kind === "resume") notify(`${barrier.by} ha reanudado`);
          else if (barrier.kind === "stall") notify(`Esperando a que cargue el vídeo de ${barrier.by}`);
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
      const { status, data } = await partyPost("/answer", { code: membership.code, member: membership.member });
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
  const followedRef = useRef<string | null | undefined>(undefined);
  const justJoinedRef = useRef(false);

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

  const join = useCallback(
    async (code: string) => {
      if (membership) await partyPost("/leave", { code: membership.code, member: membership.member });
      const { data } = await partyPost("/join", { code, name: name() });
      if (!data.success) return joinError(data.code);
      adopt(data);
      return null;
    },
    [account, isTv, membership]
  );

  const leave = useCallback(() => {
    if (!membership) return;
    partyPost("/leave", { code: membership.code, member: membership.member });
    drop("Has salido de la sala");
    setMismatch(false);
  }, [membership, drop]);

  const startNow = useCallback(() => {
    if (membership) partyPost("/start", { code: membership.code, member: membership.member });
  }, [membership]);

  const playback = useCallback((action: string, position?: number) => {
    const m = membershipRef.current;
    if (m) partyPost("/playback", { code: m.code, member: m.member, action, position });
  }, []);
  const requestPlay = useCallback(() => playback("play"), [playback]);
  const requestPause = useCallback((position: number) => playback("pause", position), [playback]);
  const requestSeek = useCallback((target: number) => playback("seek", target), [playback]);

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
  const pickKey = state?.phase === "watching" ? `${state.animeId}:${state.episode}` : null;
  const target = watchTarget(pathname);
  const onPick = !!target && !!pickKey && target.animeId === state!.animeId && target.episode === state!.episode;

  // On a reload the room's current pick is taken as seen (whoever is elsewhere gets the dialog or
  // stays put); right after joining, and whenever the pick changes, it's followed
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
  }, [pickKey, state === undefined]);

  // The host opening an episode picks it for everyone
  const pickedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!membership || !isHost || !target || onPick) return;
    const key = `${target.animeId}:${target.episode}`;
    if (pickedRef.current === key) return;
    pickedRef.current = key;
    followedRef.current = key;
    partyPost("/select", { code: membership.code, member: membership.member, ...target, audio: currentAudio() });
  }, [membership, isHost, target?.animeId, target?.episode, onPick]);

  // Away from the episode, barriers don't wait for this device. Only once the room is known: before
  // that, every page would count as away
  const known = !!party;
  useEffect(() => {
    if (membership && known) partyPost("/answer", { code: membership.code, member: membership.member, away: !onPick });
  }, [membership, known, onPick, reconnect]);

  // Anyone else opening an episode that isn't the pick is asked to leave the room first; the next
  // episode the player moves on to by itself gets a moment, as the host's is about to pick it too
  useEffect(() => {
    setMismatch(false);
    if (!membership || !party || isHost || !target || onPick) return;
    const s = party.state;
    const nextOfPick = s.phase === "watching" && target.animeId === s.animeId && target.episode === (s.episode ?? 0) + 1;
    if (!nextOfPick) return setMismatch(true);
    const timer = setTimeout(() => setMismatch(true), NEXT_EPISODE_GRACE_MS);
    return () => clearTimeout(timer);
  }, [membership, isHost, pathname, onPick, party?.state.animeId, party?.state.episode, party?.state.phase]);

  // --- The player follows the room ---
  useEffect(() => {
    if (!membership || (!onPick && !mismatch)) return;
    let video: HTMLVideoElement | null = null;
    let startTimer: ReturnType<typeof setTimeout> | undefined;
    let stallTimer: ReturnType<typeof setTimeout> | undefined;
    // Answers already given, by barrier
    let reportedFor = 0;
    let readyFor = 0;
    let checkingReadyFor = 0;
    const answer = (body: Record<string, unknown>) =>
      partyPost("/answer", { code: membership.code, member: membership.member, ...body });

    /** Where the room says playback is now */
    const roomPosition = () => {
      const s = partyRef.current!.state;
      return s.playing ? s.position + Math.max(0, serverNow() - s.at) / 1000 : s.position;
    };

    const pauseHere = () => {
      if (video && !video.paused) video.pause();
    };

    const goTo = (position: number) => {
      if (video && Math.abs(video.currentTime - position) > 0.1) video.currentTime = position;
    };

    const apply = () => {
      const s = partyRef.current?.state;
      clearTimeout(startTimer);
      if (!video || !s) return;
      // Another episode open by mistake: kept still while the dialog asks
      if (mismatch) return pauseHere();
      const barrier = s.barrier;
      if (barrier) {
        pauseHere();
        if (barrier.position === null) {
          // Step 1: say where this player stopped
          if (reportedFor !== barrier.id) {
            reportedFor = barrier.id;
            answer({ barrierId: barrier.id, position: video.currentTime });
          }
          return;
        }
        // Step 2: go there, and say so once it's buffered
        if (readyFor !== barrier.id) {
          goTo(barrier.position);
          checkingReadyFor = barrier.id;
        }
        return;
      }
      if (!s.playing) {
        pauseHere();
        if (video.readyState >= 1) goTo(s.position);
        return;
      }
      // Playing: from the agreed start time, all together
      const wait = s.at - serverNow();
      if (wait > 0) {
        pauseHere();
        goTo(s.position);
        startTimer = setTimeout(apply, wait);
        return;
      }
      if (video.readyState < 1) return;
      if (Math.abs(video.currentTime - roomPosition()) > MAX_DRIFT_S) video.currentTime = roomPosition();
      if (video.paused) video.play().catch(noop);
    };
    onSnapshotRef.current = apply;

    // The player only starts or stops on the room's word; anything else (an autoplay after a
    // reload or a server change) is undone
    const onPlay = () => {
      const s = partyRef.current?.state;
      if (!s || mismatch || s.barrier || !s.playing || s.at > serverNow()) pauseHere();
    };
    // Out of buffer while everyone plays: after a moment, everyone waits for this device
    const onWaiting = () => {
      clearTimeout(stallTimer);
      stallTimer = setTimeout(() => {
        const s = partyRef.current?.state;
        if (video && s?.playing && !s.barrier && video.readyState < 3 && !mismatch) {
          partyPost("/playback", { code: membership.code, member: membership.member, action: "stall", position: video.currentTime });
        }
      }, STALL_MS);
    };
    const onPlaying = () => clearTimeout(stallTimer);
    // A new source (another server, a retry) loads from scratch: the others wait for it right
    // away, from where this one was, rather than this device skipping ahead to catch up later.
    // After the old source is dropped currentTime reads 0, so the last time seen is used.
    let lastTime = 0;
    const onTime = () => video && video.currentTime > 0 && (lastTime = video.currentTime);
    const onReload = () => {
      const s = partyRef.current?.state;
      if (!s?.playing || s.barrier || mismatch || s.at > serverNow()) return;
      partyPost("/playback", { code: membership.code, member: membership.member, action: "stall", position: lastTime });
    };

    const bind = (next: HTMLVideoElement | null) => {
      if (next === video) return;
      if (video) {
        video.removeEventListener("play", onPlay);
        video.removeEventListener("waiting", onWaiting);
        video.removeEventListener("playing", onPlaying);
        video.removeEventListener("emptied", onReload);
        video.removeEventListener("timeupdate", onTime);
        video.removeEventListener("loadedmetadata", apply);
      }
      video = next;
      if (!video) return;
      video.addEventListener("play", onPlay);
      video.addEventListener("waiting", onWaiting);
      video.addEventListener("playing", onPlaying);
      video.addEventListener("emptied", onReload);
      video.addEventListener("timeupdate", onTime);
      video.addEventListener("loadedmetadata", apply);
      // Same room playback rate for everyone
      if (video.playbackRate !== 1) video.playbackRate = 1;
      apply();
    };

    // The player makes its <video> after loading, and may replace it when changing server
    const finder = setInterval(() => {
      bind(document.querySelector("video"));
      const barrier = partyRef.current?.state.barrier;
      // Step 2 answered once the agreed spot is buffered
      if (video && barrier && barrier.position !== null && checkingReadyFor === barrier.id && readyFor !== barrier.id) {
        goTo(barrier.position);
        if (!video.seeking && video.readyState >= 3) {
          readyFor = barrier.id;
          answer({ barrierId: barrier.id, ready: true });
        }
      }
      // A barrier opened before the player existed: answer it now
      if (video && barrier && barrier.position === null && reportedFor !== barrier.id) apply();
    }, 400);
    const drift = setInterval(() => {
      const s = partyRef.current?.state;
      if (s?.playing && !s.barrier && video && !video.paused && Math.abs(video.currentTime - roomPosition()) > MAX_DRIFT_S) apply();
    }, DRIFT_CHECK_MS);

    return () => {
      clearInterval(finder);
      clearInterval(drift);
      clearTimeout(startTimer);
      clearTimeout(stallTimer);
      onSnapshotRef.current = noop;
      bind(null);
    };
  }, [membership, onPick, mismatch, pickKey]);

  // The lobby overlay goes away at the start time everyone was given
  const [, rerender] = useState(0);
  useEffect(() => {
    if (!state?.playing) return;
    const wait = state.at - serverNow();
    if (wait <= 0) return;
    const timer = setTimeout(() => rerender((n) => n + 1), wait + 50);
    return () => clearTimeout(timer);
  }, [state?.playing, state?.at]);

  const api = useMemo<PartyApi>(
    () => ({ party, you, isHost, create, join, leave, startNow, requestPlay, requestPause, requestSeek }),
    [party, you, isHost, create, join, leave, startNow, requestPlay, requestPause, requestSeek]
  );

  const host = party?.members.find((m) => m.host) ?? null;
  const barrier = state?.barrier ?? null;
  const starting = !!state?.playing && state.at > serverNow();
  // A new pick waits in the lobby; other barriers only show a small note
  const lobby = onPick && (barrier?.kind === "pick" || (starting && !barrier && state!.position < 1));

  return (
    <PartyContext.Provider value={api}>
      {children}
      {party && !target && (isTv ? <TvPartyBadge party={party} /> : null)}
      {!isTv && !target && <PartyFab />}
      {party && onPick && !lobby && !barrier && <WatchPartyBadge party={party} />}
      {party && lobby && <LobbyOverlay party={party} isHost={isHost} onStart={startNow} starting={!barrier} />}
      {party && onPick && !lobby && (barrier || starting) && <SyncBadge party={party} />}
      {party && mismatch && host && (
        <MismatchDialog
          hostName={host.name}
          onLeave={leave}
          onBack={() => {
            setMismatch(false);
            if (party.state.phase === "watching") router.replace(pickHref(party.state));
            else router.back();
          }}
        />
      )}
      {notice && <PartyNotice text={notice} />}
    </PartyContext.Provider>
  );
}
