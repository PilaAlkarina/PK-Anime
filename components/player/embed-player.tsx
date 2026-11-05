"use client";

import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import Hls from "hls.js";
import {
  Play,
  Pause,
  Volume2,
  Volume1,
  VolumeX,
  Maximize,
  Minimize,
  RotateCcw,
  RotateCw,
  SkipForward,
  Settings,
  Captions,
  PictureInPicture2,
  Tv,
  Check,
  ChevronLeft,
  ListVideo,
  Loader2,
} from "lucide-react";
import { formatSecondsToTime, cn } from "@/lib/utils";
import { getMediaAction } from "@/lib/tv/keys";
import type { SubtitleStyles } from "./subtitle-settings-dialog";
import { attachAvSyncGuard } from "./player-core/av-sync-guard";
import { collectScopedSubtitles } from "./player-core/subtitle-scope";
import { choosePreferredServer, pickSubtitleTrack } from "./player-core/preferred-source";
import { adaptSkipTimes } from "@/lib/skip-times-adapter";
import { getPlaybackPreferences, updatePlaybackPreferences } from "@/lib/playback-preferences";
import { isBackKey } from "@/lib/tv/keys";
import { useBackHandler } from "@/components/tv/navigation-provider";
import { Timeline } from "./ui/timeline";
import { SettingsPanel, type PanelView } from "./ui/settings-panel";
import { PauseScreen } from "./ui/pause-screen";
import { NextEpisodeScreen } from "./ui/next-episode-screen";
import { profileKey } from "@/lib/library/profiles";
import { RemoteHints } from "./ui/remote-hints";
import { SubtitleText } from "./ui/subtitle-text";
import { LoadingVeil } from "./ui/loading-veil";
import { PlayerErrorScreen, type PlayerErrorKind, type TriedServer } from "./ui/error-screen";
import { arrowStep, focusFirst, moveFocus, type NavAxis } from "./ui/focus-nav";
import type { NextEpisodeInfo } from "./ui/types";
import { detectSubtitleLanguage, isForcedSubtitle, subtitleLanguageName } from "./player-core/subtitle-language";

export interface SubtitleTrack {
  id?: string;
  language: string;
  label: string;
  url: string;
  default?: boolean;
}

export interface SubtitleCue {
  start: number;
  end: number;
  text: string;
}

export interface VideoSourceData {
  id: string;
  type: "SUB" | "DUB";
  language: string;
  videoUrl: string;
  quality: string;
  isHls: boolean;
  serverName?: string | null;
  isDefault?: boolean;
  subtitles?: Array<{
    id?: string;
    language?: string;
    label?: string;
    subtitleUrl?: string;
    url?: string;
    file?: string;
    direct_url?: string;
    isDefault?: boolean;
    default?: boolean;
  }>;
  intro?: { start: number; end: number } | null;
  outro?: { start: number; end: number } | null;
  chapters?: Array<{ start: number; end?: number; title: string }>;
  refDuration?: number;
}

export function isNativePlayerSource(s: VideoSourceData): boolean {
  if (!s || !s.videoUrl) return false;
  const url = s.videoUrl.toLowerCase();
  const name = (s.serverName || "").toLowerCase();

  // Server Buzz streams are direct proxied .m3u8 manifests, so they play natively
  if (name.includes("buzz") || url.includes("server=buzz") || s.id?.includes("buzz")) {
    return true;
  }

  const isEmbedHost =
    url.includes("anixo.buzz") ||
    url.includes("vidwish.live") ||
    url.includes("otakuvid") ||
    url.includes("otakuhg") ||
    url.includes("zokoanime") ||
    url.includes("videasy") ||
    url.includes("multiembed") ||
    url.includes("vidsrc") ||
    url.includes("2embed") ||
    url.includes("autoembed");

  if (isEmbedHost) {
    return false;
  }

  return Boolean(
    s.isHls ||
    url.includes(".m3u8") ||
    url.includes("m3u8") ||
    url.includes("/api/play") ||
    url.includes("/api/proxy/m3u8")
  );
}

/** Track name in Spanish ("Español", "Inglés (carteles)"), whatever the provider called it */
function subtitleLabel(track: SubtitleTrack): string {
  const code = detectSubtitleLanguage(track);
  if (!code) return track.label || track.language;
  const text = `${track.label || ""} ${track.language || ""}`;
  const region = /latin|latino|\(la\)|419|mexic/i.test(text)
    ? "Latinoamérica"
    : /brazil|brasil|pt-br/i.test(text)
      ? "Brasil"
      : /spain|españa|castil|es-es|european/i.test(text)
        ? "España"
        : null;
  const notes = [region, isForcedSubtitle(track) ? "carteles" : null].filter(Boolean);
  return `${subtitleLanguageName(code)}${notes.length ? ` (${notes.join(", ")})` : ""}`;
}

export interface EmbedPlayerProps {
  anilistId?: number | null;
  malId?: number | null;
  episodeNumber: number;
  initialAudio?: "sub" | "dub";
  initialServer?: string;
  startAt?: number;
  /** Forced by the embed URL; when left out, the viewer's saved preference applies */
  autoskipIntro?: boolean;
  autoskipOutro?: boolean;
  parentHost?: string | null;
  title?: string;
  /** Same events as the postMessage bridge, for pages that render the player directly */
  onPlayerEvent?: (name: string, data: any) => void;
  /**
   * Let the playback preferences pick the server (preferred server, or the one that has the
   * wanted subtitle language). Off when the embed URL names a server explicitly.
   */
  autoSelectServer?: boolean;

  // Library only: the embed can't know these, and hides what depends on them
  /** Remote-control layout: bigger controls, focus moved with the arrows, Back handled here */
  tv?: boolean;
  episodeTitle?: string | null;
  synopsis?: string | null;
  nextEpisode?: NextEpisodeInfo | null;
  onBack?: () => void;
  onEpisodes?: () => void;
  onNextEpisode?: () => void;
  /** Art behind the loading screen: the episode's thumbnail, else the anime's banner */
  poster?: string | null;
  /** When this episode airs or aired (Unix seconds), when known: an episode still ahead isn't
   *  looked for, and one just aired that no server has yet says so */
  airingAt?: number | null;
  /** "Ver juntos": the room decides playback (see PlayerSync) */
  sync?: PlayerSync | null;
}

/**
 * Controlled playback for a "Ver juntos" room. The viewer's play, pause and jumps (keys, the
 * timeline, the skip buttons, the intro/ending auto-skip) aren't applied here: they're asked of
 * the room, which pauses, moves and starts every player itself. Only the host may jump; the
 * others' jumps and auto-skips are off.
 */
export interface PlayerSync {
  canSeek: boolean;
  onPlay: (position: number) => void;
  onPause: (position: number) => void;
  onSeek: (target: number) => void;
}

/** While no server has the episode yet, they're asked again: often in its first hour (when it
 *  usually shows up), then less */
const RECHECK_FIRST_HOUR_MS = 3 * 60 * 1000;
const RECHECK_LATER_MS = 10 * 60 * 1000;

/** Seconds of countdown before the next episode starts on its own */
const NEXT_COUNTDOWN = 10;
/** How long a pause lasts before the pause screen covers the frame */
const PAUSE_SCREEN_DELAY = 2500;
/** Time the next episode's player has to mount before full screen is given up */
const FULLSCREEN_HANDOVER_MS = 1500;
let mountedPlayers = 0;

export function EmbedPlayer({
  sync,
  anilistId,
  malId,
  episodeNumber,
  initialAudio = "sub",
  initialServer = "flow",
  startAt = 0,
  autoskipIntro,
  autoskipOutro,
  parentHost,
  title: initialTitle,
  onPlayerEvent,
  autoSelectServer = true,
  tv = false,
  episodeTitle,
  synopsis,
  nextEpisode,
  onBack,
  onEpisodes,
  onNextEpisode,
  poster,
  airingAt = null,
}: EmbedPlayerProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const hlsRef = useRef<Hls | null>(null);
  const controlsRef = useRef<HTMLDivElement | null>(null);
  const skipButtonRef = useRef<HTMLButtonElement | null>(null);

  // Playback state
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [buffered, setBuffered] = useState(0);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [showRemainingTime, setShowRemainingTime] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [volumeBoost, setVolumeBoost] = useState(1);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [isLoading, setIsLoading] = useState(true);
  const [fatalError, setFatalError] = useState<string | null>(null);
  // Why it can't play (the error screen's wording and actions), and the servers that were tried
  const [errorKind, setErrorKind] = useState<PlayerErrorKind>("failed");
  const [triedServers, setTriedServers] = useState<TriedServer[]>([]);
  const [nextCheckAt, setNextCheckAt] = useState<number | null>(null);
  const [checkEveryMs, setCheckEveryMs] = useState<number | null>(null);
  // Checks made while waiting for the episode, and when the wait began (its first hour is
  // counted from the air time when known, else from here)
  const [checks, setChecks] = useState(0);
  const waitingSinceRef = useRef<number | null>(null);
  // Servers tried for this episode and audio since the last (re)start, by source id: the
  // failover moves on to one not in here, and stops when they've all failed
  const triedRef = useRef(new Map<string, TriedServer>());

  // Server & Audio options
  const [selectedType, setSelectedType] = useState<"sub" | "dub">(initialAudio);
  const [server, setServer] = useState<string>(initialServer.toLowerCase());
  const [sources, setSources] = useState<VideoSourceData[]>([]);
  const [activeSourceId, setActiveSourceId] = useState<string | null>(null);
  // Read where the viewer acts, so the latest room state applies without re-binding handlers
  const syncRef = useRef(sync);
  syncRef.current = sync;
  const [autoSkipState, setAutoSkipState] = useState<boolean>(autoskipIntro ?? true);
  const [autoSkipOutroState, setAutoSkipOutroState] = useState<boolean>(autoskipOutro ?? true);
  const [streamUrl, setStreamUrl] = useState<string | null>(null);
  const [animeTitle, setAnimeTitle] = useState<string>(initialTitle || "Anime");
  const [reloadCounter, setReloadCounter] = useState<number>(0);

  // HLS & Qualities
  const [hlsLevels, setHlsLevels] = useState<{ index: number; name: string; height: number }[]>([]);
  const [selectedHlsLevel, setSelectedHlsLevel] = useState<number>(-1);

  // Subtitles
  const [allAvailableSubtitles, setAllAvailableSubtitles] = useState<SubtitleTrack[]>([]);
  const [activeSubtitleTrack, setActiveSubtitleTrack] = useState<string | null>("en");
  const [cues, setCues] = useState<SubtitleCue[]>([]);
  const [currentSubtitleText, setCurrentSubtitleText] = useState<string>("");
  const [subtitleStyles, setSubtitleStyles] = useState<SubtitleStyles>({
    fontSize: "base",
    fontFamily: "sans",
    fontWeight: "bold",
    color: "#ffffff",
    background: "transparent",
    shadow: true,
    outline: "thick",
  });

  // Saved preferences live in localStorage, which the server can't see. Restoring them after
  // mount keeps the first client render identical to the server HTML (volume icon, subtitle styling).
  useEffect(() => {
    try {
      const savedVolume = parseFloat(localStorage.getItem("anime_player_volume") || "");
      if (!Number.isNaN(savedVolume)) setVolume(Math.min(1, Math.max(0, savedVolume)));
      if (localStorage.getItem("anime_player_muted") === "true") setIsMuted(true);
      setSubtitleStyles(getPlaybackPreferences().subtitleStyles);
    } catch {}
  }, []);

  // Baseline Skip Times (e.g. from Re:ANIME chapters or AniSkip submission)
  const [rawSkipTimes, setRawSkipTimes] = useState<{
    intro: { start: number; end: number } | null;
    outro: { start: number; end: number } | null;
    refDuration: number;
    source?: string;
  }>({ intro: null, outro: null, refDuration: 1440 });

  // Effective Skip Times dynamically adapted to the currently playing video duration
  const [skipTimes, setSkipTimes] = useState<{
    intro: { start: number; end: number } | null;
    outro: { start: number; end: number } | null;
  }>({ intro: null, outro: null });

  // Dynamically set skip times; only adapt with math if from Flow/Re:ANIME baseline
  useEffect(() => {
    if (!rawSkipTimes.intro && !rawSkipTimes.outro) return;
    const isFlowSource = rawSkipTimes.source?.includes("flow") || rawSkipTimes.source?.includes("reanime");
    const isFlowSrv = server.toLowerCase().includes("flow") || server.toLowerCase().includes("kitty");
    if ((isFlowSource || isFlowSrv) && duration > 0) {
      const adapted = adaptSkipTimes(
        rawSkipTimes.intro,
        rawSkipTimes.outro,
        rawSkipTimes.refDuration,
        duration
      );
      setSkipTimes({ intro: adapted.intro, outro: adapted.outro });
    } else {
      setSkipTimes({ intro: rawSkipTimes.intro, outro: rawSkipTimes.outro });
    }
  }, [duration, rawSkipTimes, server]);

  // Ajustes side panel: the open view, or null when closed
  const [panelView, setPanelView] = useState<PanelView | null>(null);
  const panelOpenRef = useRef(false);
  panelOpenRef.current = panelView !== null;

  // Pause screen, shown once a pause has lasted a moment
  const [pauseScreen, setPauseScreen] = useState(false);

  // Up next: shown when the ending starts or the video ends
  const [nextUp, setNextUp] = useState(false);
  const [ended, setEnded] = useState(false);
  // False until the episode first plays: the loading screen covers the player until then
  const [hasStarted, setHasStarted] = useState(false);
  const [nextCountdown, setNextCountdown] = useState<number | null>(null);
  const nextUpDismissedRef = useRef(false);
  const [autoplayNext, setAutoplayNext] = useState(true);
  // The list service the episode was marked on (MyAnimeList, AniList), once it is
  const [markedOn, setMarkedOn] = useState<string | null>(null);

  // Player height scales the subtitles; wide mouse screens frame the credits on "up next"
  const [playerHeight, setPlayerHeight] = useState(0);
  const [wideScreen, setWideScreen] = useState(false);
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setPlayerHeight(el.clientHeight));
    ro.observe(el);
    const query = window.matchMedia("(pointer: fine) and (min-width: 900px)");
    const update = () => setWideScreen(query.matches);
    update();
    query.addEventListener("change", update);
    // Saved after mount, like the other preferences, so the first render matches the server's
    const prefs = getPlaybackPreferences();
    setAutoplayNext(prefs.autoplayNext);
    if (autoskipIntro === undefined) setAutoSkipState(prefs.autoSkipIntro);
    if (autoskipOutro === undefined) setAutoSkipOutroState(prefs.autoSkipOutro);
    return () => {
      ro.disconnect();
      query.removeEventListener("change", update);
    };
  }, []);

  // Notifications & Feedback
  const [seekFeedback, setSeekFeedback] = useState<{
    side: "left" | "right";
    amount: number;
  } | null>(null);
  const [activeStreamToast, setActiveStreamToast] = useState<{
    type: "refreshing" | "success" | "info" | "error";
    message: string;
  } | null>(null);
  const [autoSkipToast, setAutoSkipToast] = useState<string | null>(null);

  // Operational refs
  const hideControlsTimer = useRef<NodeJS.Timeout | null>(null);
  const progressSaveTimer = useRef<NodeJS.Timeout | null>(null);
  const isPlayingRef = useRef<boolean>(false);
  const showControlsRef = useRef<boolean>(true);
  const isSwitchingServerRef = useRef<boolean>(false);
  const preserveTimeRef = useRef<number>(startAt || 0);
  const hasAutoSkippedIntroRef = useRef<boolean>(false);
  const hasAutoSkippedOutroRef = useRef<boolean>(false);
  const lastTouchTimeRef = useRef<number>(0);
  const lastTapInfoRef = useRef<{ time: number; x: number; y: number } | null>(null);
  const singleTapTimerRef = useRef<NodeJS.Timeout | null>(null);
  const clickTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const seekFeedbackTimerRef = useRef<NodeJS.Timeout | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const gainNodeRef = useRef<GainNode | null>(null);
  const sourceNodeRef = useRef<MediaElementAudioSourceNode | null>(null);
  const connectedVideoRef = useRef<HTMLVideoElement | null>(null);
  // Moves to the next server not tried yet; "missing" when this one answered it doesn't have the episode
  const fallbackRef = useRef<(reason?: TriedServer["reason"], detail?: string) => void>(() => {});

  const lastProgressEmitRef = useRef<number>(0);
  const malSyncedRef = useRef<boolean>(false);
  // Episode whose server the preferences already picked, so manual switches are left alone
  const autoServerDoneRef = useRef<string | null>(null);

  // Watch position is saved in this browser, per anime and episode
  // Per library profile, like the rest of what the library keeps on the device
  const progressKey = profileKey(`anime_progress:${anilistId ? `ani:${anilistId}` : `mal:${malId}`}:${episodeNumber}`);

  // Resume from the saved position unless the embed URL asks for a start time
  useEffect(() => {
    malSyncedRef.current = false;
    nextUpDismissedRef.current = false;
    setMarkedOn(null);
    setNextUp(false);
    setNextCountdown(null);
    setEnded(false);
    setHasStarted(false);
    if (startAt) return;
    try {
      const saved = JSON.parse(localStorage.getItem(progressKey) || "null");
      if (saved?.currentTime > 5 && (!saved.duration || saved.currentTime < saved.duration * 0.95)) {
        preserveTimeRef.current = saved.currentTime;
      }
    } catch {}
  }, [progressKey, startAt]);

  const onPlayerEventRef = useRef(onPlayerEvent);
  onPlayerEventRef.current = onPlayerEvent;

  // Broadcast to parent page via PostMessage
  const postToParent = useCallback(
    (name: string, data: any, requestId?: string) => {
      onPlayerEventRef.current?.(name, data);
      if (typeof window === "undefined" || window.parent === window) return;
      try {
        // Standard aniembed format from specification
        window.parent.postMessage(
          {
            source: "aniembed",
            version: 1,
            name,
            requestId,
            data,
          },
          "*"
        );

        // Backward compatibility for existing listeners
        window.parent.postMessage({ type: "PLAYER_EVENT", data: { type: name, ...data } }, "*");
        if (name === "progress") {
          window.parent.postMessage({ type: "watching-log", ...data }, "*");
        }
      } catch {}
    },
    []
  );

  /** Stops trying and shows the error screen with `kind`'s wording */
  const failPlayback = useCallback(
    (kind: PlayerErrorKind, message: string) => {
      setErrorKind(kind);
      // Every full round of servers that came back empty counts as one check
      if (kind === "unavailable") {
        setChecks((c) => c + 1);
        waitingSinceRef.current ??= Date.now();
      }
      setTriedServers(Array.from(triedRef.current.values()));
      setFatalError(message);
      setIsLoading(false);
      postToParent("PLAYER_EVENT", {
        type: "error",
        code: kind === "offline" ? "OFFLINE" : kind === "not-aired" ? "NOT_AIRED" : "CONTENT_UNAVAILABLE",
        message,
      });
    },
    [postToParent]
  );

  /** Starts over from the first server, as on opening the episode */
  const retryPlayback = useCallback(() => {
    const time = videoRef.current?.currentTime ?? 0;
    if (time > 0) preserveTimeRef.current = time;
    triedRef.current.clear();
    setTriedServers([]);
    setNextCheckAt(null);
    setFatalError(null);
    setIsLoading(true);
    setReloadCounter((prev) => prev + 1);
  }, []);

  // A new episode or audio starts with every server untried
  useEffect(() => {
    triedRef.current.clear();
    setTriedServers([]);
    setNextCheckAt(null);
    setChecks(0);
    waitingSinceRef.current = null;
  }, [anilistId, malId, episodeNumber, selectedType]);

  // Show status toast
  const showToast = useCallback((type: "refreshing" | "success" | "info" | "error", message: string) => {
    setActiveStreamToast({ type, message });
    setTimeout(() => {
      setActiveStreamToast((prev) => (prev?.message === message ? null : prev));
    }, 3000);
  }, []);

  // Mark the episode as watched on the viewer's list (MyAnimeList or AniList), once per episode. Without a
  // session (or in a third-party embed, where the session cookie is blocked) the route answers 401.
  const syncMalProgress = useCallback(() => {
    if (malSyncedRef.current) return;
    malSyncedRef.current = true;
    fetch("/api/mal/list-status", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ anilistId, malId, episode: episodeNumber }),
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        // The saved entry, so the page can update its copy of the list instead of downloading it again
        if (data?.entry) postToParent("list_entry", { entry: data.entry });
        if (data?.updated) {
          const service = data.provider?.name || "tu lista";
          setMarkedOn(service);
          showToast("success", `Episodio ${episodeNumber} marcado como visto en ${service}`);
        }
      })
      .catch(() => {});
  }, [anilistId, malId, episodeNumber, showToast, postToParent]);

  // Web Audio Graph setup for Volume Boost past 100%
  const setupAudioGraph = useCallback(() => {
    if (!videoRef.current || typeof window === "undefined") return;
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;

      if (connectedVideoRef.current !== videoRef.current) {
        if (audioCtxRef.current && audioCtxRef.current.state !== "closed") {
          try {
            audioCtxRef.current.close();
          } catch {}
        }
        audioCtxRef.current = null;
        gainNodeRef.current = null;
        sourceNodeRef.current = null;
      }

      if (!audioCtxRef.current) {
        const ctx = new AudioCtx();
        audioCtxRef.current = ctx;
        const gain = ctx.createGain();
        gainNodeRef.current = gain;
        const source = ctx.createMediaElementSource(videoRef.current);
        sourceNodeRef.current = source;
        connectedVideoRef.current = videoRef.current;
        source.connect(gain);
        gain.connect(ctx.destination);
      }
      if (audioCtxRef.current.state === "suspended") {
        audioCtxRef.current.resume().catch(() => {});
      }
    } catch (err) {
      console.warn("[EmbedPlayer] Web Audio API init error:", err);
    }
  }, []);

  const handleVolumeBoost = (boost: number) => {
    setVolumeBoost(boost);
    try {
      localStorage.setItem("anime_volume_boost", boost.toString());
    } catch {}

    if (boost !== 1) {
      setupAudioGraph();
    }
    if (gainNodeRef.current) {
      gainNodeRef.current.gain.value = boost;
    }
    if (audioCtxRef.current && audioCtxRef.current.state === "suspended") {
      audioCtxRef.current.resume().catch(() => {});
    }
  };

  // Activity detection & Auto-hide Controls (3 seconds auto-hide when playing, 5 on TV)
  const handleUserActivity = useCallback(() => {
    setShowControls(true);
    showControlsRef.current = true;
    if (hideControlsTimer.current) clearTimeout(hideControlsTimer.current);
    if (isPlayingRef.current) {
      hideControlsTimer.current = setTimeout(() => {
        if (panelOpenRef.current) return;
        setShowControls(false);
        showControlsRef.current = false;
        // With the bar gone, the arrows seek again instead of moving between its buttons
        if (controlsRef.current?.contains(document.activeElement)) (document.activeElement as HTMLElement).blur();
      }, tv ? 5000 : 3000);
    }
  }, [tv]);

  // Load Skip Times (Flow chapters for Flow/Kitty; direct AniSkip for other servers)
  useEffect(() => {
    let cancelled = false;
    async function loadSkipTimes() {
      try {
        const idParam = anilistId ? `anilistId=${anilistId}` : `malId=${malId}`;
        const titleParam = animeTitle ? `&title=${encodeURIComponent(animeTitle)}` : "";
        const srvParam = `&server=${encodeURIComponent(server)}`;
        const isFlowSrv = server.toLowerCase().includes("flow") || server.toLowerCase().includes("kitty");
        const currentDur = (videoRef.current && videoRef.current.duration > 0)
          ? videoRef.current.duration
          : duration;
        const durParam = currentDur > 0 ? `&duration=${Math.round(currentDur)}` : "";

        // 1. Fetch skip times specifically for current server
        const res = await fetch(`/api/anime/skip-times?${idParam}&episode=${episodeNumber}${titleParam}${srvParam}${durParam}`);
        if (res.ok && !cancelled) {
          const data = await res.json();
          if (data.found && (data.intro || data.outro || data.rawIntro || data.rawOutro)) {
            const rawIn = data.rawIntro || data.intro || null;
            const rawOut = data.rawOutro || data.outro || null;
            const refDur = data.refDuration || 1440;
            const srcType = data.source || (isFlowSrv ? "flow-reanime" : "aniskip");

            setRawSkipTimes((prev) => {
              // Never downgrade verified Reanime chapters with generic aniskip
              if (prev.source === "flow-reanime" && srcType === "aniskip" && (prev.intro || prev.outro)) {
                return prev;
              }
              return {
                intro: rawIn,
                outro: rawOut,
                refDuration: refDur,
                source: srcType,
              };
            });

            if (isFlowSrv && currentDur > 0) {
              const adapted = adaptSkipTimes(rawIn, rawOut, refDur, currentDur);
              setSkipTimes((prev) => {
                if (data.source === "aniskip" && prev.intro && isFlowSrv) return prev;
                return { intro: adapted.intro, outro: adapted.outro };
              });
            } else {
              setSkipTimes((prev) => {
                if (data.source === "aniskip" && prev.intro && isFlowSrv) return prev;
                return { intro: data.intro || rawIn, outro: data.outro || rawOut };
              });
            }
            return;
          }
        }

        // 2. Direct fallback to flow-skip-times ONLY on Flow/Kitty servers
        if (isFlowSrv) {
          const flowRes = await fetch(`/api/anime/flow-skip-times?${idParam}&episode=${episodeNumber}${durParam}${titleParam}`);
          if (flowRes.ok && !cancelled) {
            const flowData = await flowRes.json();
            if (flowData.found && (flowData.intro || flowData.outro)) {
              const rawIn = flowData.rawIntro || flowData.intro || null;
              const rawOut = flowData.rawOutro || flowData.outro || null;
              const refDur = flowData.refDuration || 1440;
              setRawSkipTimes({
                intro: rawIn,
                outro: rawOut,
                refDuration: refDur,
                source: "flow-reanime",
              });
              if (currentDur > 0) {
                const adapted = adaptSkipTimes(rawIn, rawOut, refDur, currentDur);
                setSkipTimes({ intro: adapted.intro, outro: adapted.outro });
              } else {
                setSkipTimes({ intro: flowData.intro || rawIn, outro: flowData.outro || rawOut });
              }
            }
          }
        }
      } catch {}
    }
    loadSkipTimes();
    return () => {
      cancelled = true;
    };
  }, [anilistId, malId, episodeNumber, animeTitle, server]);

  // Fetch Stream from /api/play
  useEffect(() => {
    let cancelled = false;
    async function loadStream() {
      setIsLoading(true);
      setFatalError(null);
      // Still ahead: no server can have it, so none is asked; the screen counts down instead
      if (airingAt && airingAt * 1000 > Date.now()) {
        failPlayback("not-aired", "Este episodio todavía no se ha emitido");
        return;
      }
      if (typeof navigator !== "undefined" && navigator.onLine === false) {
        failPlayback("offline", "No hay conexión a internet");
        return;
      }
      try {
        const params = new URLSearchParams();
        if (anilistId) params.set("anilistId", anilistId.toString());
        if (malId) params.set("malId", malId.toString());
        params.set("episode", episodeNumber.toString());
        params.set("audio", selectedType);
        params.set("server", server);

        const res = await fetch(`/api/play?${params.toString()}`);
        if (!res.ok) {
          throw new Error(`El servidor no devolvió el vídeo (error ${res.status})`);
        }
        const data = await res.json();
        if (cancelled) return;

        const initialStream = data.streamUrl || data.m3u8 || data.url || data.fullM3u8;

        const incomingSources: VideoSourceData[] = Array.isArray(data.sources) && data.sources.length > 0
          ? data.sources
          : Array.isArray(data.allServers) && data.allServers.length > 0
          ? data.allServers
          : [];

        // Build standard 5-provider roster for Sub only (never synthesize fake DUB)
        const idParams = `${anilistId ? `anilistId=${anilistId}&` : ""}${malId ? `malId=${malId}&` : ""}episode=${episodeNumber}`;
        const standardFallbackProviders: VideoSourceData[] = [
          { id: "flow-sub", type: "SUB", language: "Japanese", videoUrl: `/api/play?${idParams}&audio=sub&server=flow&format=m3u8`, quality: "1080p", isHls: true, serverName: "Flow (Sub)" },
          { id: "kitty-sub", type: "SUB", language: "Japanese", videoUrl: `/api/play?${idParams}&audio=sub&server=kitty&format=m3u8`, quality: "1080p", isHls: true, serverName: "Kitty (Sub)" },
          { id: "animex-yuri-sub", type: "SUB", language: "Japanese", videoUrl: `/api/play?${idParams}&audio=sub&server=yuri&format=m3u8`, quality: "1080p", isHls: true, serverName: "Yuri (Sub)" },
          { id: "animex-zuri-sub", type: "SUB", language: "Japanese", videoUrl: `/api/play?${idParams}&audio=sub&server=zuri&format=m3u8`, quality: "1080p", isHls: true, serverName: "Zuri (Sub)" },
          { id: "buzz-sub", type: "SUB", language: "Japanese", videoUrl: `/api/play?${idParams}&audio=sub&server=buzz&format=m3u8`, quality: "1080p", isHls: true, serverName: "Buzz (Sub)" },
        ];

        // Clean & ensure proxying on external URLs
        const cleanedIncoming = incomingSources.map((s) => {
          let u = (s.videoUrl || "").trim();
          if ((u.startsWith("http://") || u.startsWith("https://")) && !u.includes("/api/proxy")) {
            u = `/api/proxy/m3u8?url=${encodeURIComponent(u)}`;
          }
          return { ...s, videoUrl: u };
        });

        // Find if ANY Reanime source in incoming has chapters/skip times
        const reanimeCandidate = cleanedIncoming.find(
          (s) =>
            (s.id?.includes("flow") ||
              s.id?.includes("kitty") ||
              s.serverName?.toLowerCase().includes("flow") ||
              s.serverName?.toLowerCase().includes("kitty") ||
              s.serverName?.toLowerCase().includes("hd")) &&
            (s.intro || s.outro || (s.chapters && s.chapters.length > 0))
        );

        let apiIntro: { start: number; end: number } | null = data.intro || reanimeCandidate?.intro || null;
        let apiOutro: { start: number; end: number } | null = data.outro || reanimeCandidate?.outro || null;
        let apiChapters = (Array.isArray(data.chapters) && data.chapters.length > 0)
          ? data.chapters
          : (reanimeCandidate?.chapters || []);
        let apiRefDuration = data.refDuration || reanimeCandidate?.refDuration || 1440;

        if (!apiIntro && !apiOutro && Array.isArray(apiChapters) && apiChapters.length > 0) {
          const introChap = apiChapters.find((c: any) => c.title?.toLowerCase().includes("intro") || c.title?.toLowerCase().includes("op") || c.title?.toLowerCase().includes("opening"));
          const outroChap = apiChapters.find((c: any) => c.title?.toLowerCase().includes("outro") || c.title?.toLowerCase().includes("ed") || c.title?.toLowerCase().includes("ending"));
          if (introChap) apiIntro = { start: introChap.start, end: introChap.end };
          if (outroChap) apiOutro = { start: outroChap.start, end: outroChap.end };
        }

        // Enrich all Reanime sources so both Flow and Kitty servers share the exact same skip times right away
        const enrichedIncoming = cleanedIncoming.map((s) => {
          const isRe = s.id?.includes("flow") || s.id?.includes("kitty") || s.serverName?.toLowerCase().includes("flow") || s.serverName?.toLowerCase().includes("kitty") || s.serverName?.toLowerCase().includes("hd");
          if (isRe) {
            return {
              ...s,
              intro: s.intro || apiIntro,
              outro: s.outro || apiOutro,
              chapters: (s.chapters && s.chapters.length > 0) ? s.chapters : apiChapters,
              refDuration: s.refDuration || apiRefDuration,
            };
          }
          return s;
        });

        // Merge discovered streams with standard fallback routes
        const allAvailableSources: VideoSourceData[] = [...enrichedIncoming];
        for (const fp of standardFallbackProviders) {
          if (!allAvailableSources.some((s) => s.id === fp.id)) {
            const isRe = fp.id.includes("flow") || fp.id.includes("kitty");
            allAvailableSources.push(
              isRe
                ? { ...fp, intro: apiIntro, outro: apiOutro, chapters: apiChapters, refDuration: apiRefDuration }
                : fp
            );
          }
        }
        setSources(allAvailableSources);

        // Detect if Dub is genuinely available on this anime
        const hasAuthenticDub = cleanedIncoming.some((s) => s.type === "DUB" && !(s as any).audio_fallback);
        if (selectedType === "dub" && (!hasAuthenticDub || data.hasDub === false || data.audio_fallback)) {
          setSelectedType("sub");
          showToast("info", "Este episodio no tiene doblaje en inglés. Se pone en versión original.");
        }

        if (!initialStream && allAvailableSources.length === 0) {
          throw new Error(data.error || "El servidor no tiene un vídeo que se pueda reproducir.");
        }

        const isDub = selectedType === "dub" && hasAuthenticDub && data.hasDub !== false && !data.audio_fallback;
        const typeMatch = (s: VideoSourceData) => (isDub ? s.type === "DUB" : s.type === "SUB");
        const sNorm = server.toLowerCase().replace(/[\s_]/g, "-");
        let selectedSource: VideoSourceData | undefined;

        if (sNorm.includes("buzz") || sNorm.includes("megaplay")) {
          selectedSource = allAvailableSources.find((s) => (s.id?.includes("buzz") || s.serverName?.toLowerCase().includes("buzz") || s.id?.includes("megaplay") || s.serverName?.toLowerCase().includes("megaplay")) && typeMatch(s));
        } else if (sNorm.includes("zuri") || sNorm.includes("zuna")) {
          selectedSource = allAvailableSources.find((s) => (s.id?.includes("zuri") || s.id?.includes("zuna") || s.serverName?.toLowerCase().includes("zuri")) && typeMatch(s));
        } else if (sNorm.includes("yuri") || sNorm.includes("yuki")) {
          selectedSource = allAvailableSources.find((s) => (s.id?.includes("yuri") || s.id?.includes("yuki") || s.serverName?.toLowerCase().includes("yuri")) && typeMatch(s));
        } else if (sNorm.includes("kitty") || sNorm.includes("flow-2") || sNorm.includes("hd-2")) {
          selectedSource = allAvailableSources.find((s) => (s.id?.includes("kitty") || s.serverName?.toLowerCase().includes("kitty") || s.id?.includes("flow-2") || s.serverName?.toLowerCase().includes("hd-2")) && typeMatch(s));
        } else if (sNorm.includes("flow") || sNorm.includes("reanime")) {
          selectedSource = allAvailableSources.find((s) => (s.id?.includes("flow") || s.serverName?.toLowerCase().includes("flow") || s.id?.includes("reanime") || s.serverName?.toLowerCase().includes("hd-1")) && !s.id?.includes("kitty") && !s.serverName?.toLowerCase().includes("kitty") && typeMatch(s));
        }

        if (!selectedSource && initialStream) {
          selectedSource = allAvailableSources.find((s) => s.videoUrl === initialStream);
        }
        if (!selectedSource) {
          selectedSource = allAvailableSources.find(typeMatch) || allAvailableSources[0];
        }

        // Once per episode, let the preferences move playback to the preferred server or to
        // the one that has the wanted subtitle language; the effect then reloads that server
        const episodeKey = `${anilistId}:${malId}:${episodeNumber}`;
        if (autoSelectServer && autoServerDoneRef.current !== episodeKey) {
          autoServerDoneRef.current = episodeKey;
          const audio = isDub ? "dub" : "sub";
          const choice = await choosePreferredServer({
            sources: cleanedIncoming,
            audio,
            currentServer: server,
            prefs: getPlaybackPreferences(),
            probeSubtitles: async (code) => {
              const probe = new URLSearchParams(params);
              probe.set("audio", audio);
              probe.set("server", code);
              const probeData = await fetch(`/api/play?${probe}`).then((r) => r.json());
              // The API answers from another server when this one has nothing
              return String(probeData?.server || "").toLowerCase().includes(code) && Array.isArray(probeData.subtitles)
                ? probeData.subtitles
                : [];
            },
          });
          if (cancelled) return;
          if (choice) {
            const serverLabel = choice.server.charAt(0).toUpperCase() + choice.server.slice(1);
            showToast(
              "info",
              choice.language
                ? `Cambiado a ${serverLabel} para tener subtítulos en ${subtitleLanguageName(choice.language).toLowerCase()}`
                : `Cambiado a ${serverLabel}`
            );
            setServer(choice.server);
            return;
          }
        }

        if (selectedSource) {
          setActiveSourceId(selectedSource.id);
          setStreamUrl(initialStream || selectedSource.videoUrl);
        } else {
          setStreamUrl(initialStream);
        }

        // Apply skip times from Re:ANIME
        const isFlowData = data.server?.toLowerCase().includes("flow") || data.server?.toLowerCase().includes("kitty") || data.server?.toLowerCase().includes("hd") || Boolean(reanimeCandidate);
        if (apiIntro || apiOutro) {
          const refDur = apiRefDuration;
          setRawSkipTimes({
            intro: apiIntro,
            outro: apiOutro,
            refDuration: refDur,
            source: isFlowData ? "flow-reanime" : "aniskip",
          });
          const curDur = (videoRef.current && videoRef.current.duration > 0) ? videoRef.current.duration : duration;
          if (isFlowData && curDur > 0) {
            const adapted = adaptSkipTimes(apiIntro, apiOutro, refDur, curDur);
            setSkipTimes({ intro: adapted.intro, outro: adapted.outro });
          } else {
            setSkipTimes({ intro: apiIntro, outro: apiOutro });
          }
        }

        if (data.title) setAnimeTitle(data.title);

        // Subtitles resolution using scoped subtitle collectors
        const scopedSubs = collectScopedSubtitles({
          currentSource: selectedSource,
          allSources: allAvailableSources,
          dynamicSubtitles: data.subtitles,
        });

        const mappedSubs: SubtitleTrack[] = scopedSubs.map((s) => ({
          id: s.id,
          language: s.language,
          label: s.label,
          url: s.subtitleUrl,
          default: s.isDefault,
        }));

        if (mappedSubs.length > 0) {
          setAllAvailableSubtitles(mappedSubs);
          setActiveSubtitleTrack(pickSubtitleTrack(mappedSubs, isDub ? "dub" : "sub", getPlaybackPreferences()));
        } else {
          setAllAvailableSubtitles([]);
          setActiveSubtitleTrack("");
        }

        postToParent("PLAYER_EVENT", {
          type: "ready",
          server,
          audio: selectedType,
          episode: episodeNumber,
        });
      } catch (err: any) {
        if (!cancelled) {
          console.error("Stream loading failed:", err);
          // fetch rejects with a TypeError when the network is down
          const offline = navigator.onLine === false || (err instanceof TypeError && /fetch|network/i.test(err.message));
          failPlayback(
            offline ? "offline" : "failed",
            offline ? "No hay conexión a internet" : err.message || "No se ha podido cargar el vídeo"
          );
        }
      }
    }
    loadStream();
    return () => {
      cancelled = true;
    };
  }, [anilistId, malId, episodeNumber, selectedType, server, reloadCounter, postToParent, failPlayback, airingAt]);

  // HLS player setup & Native fallback
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !streamUrl) return;

    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }

    const startPos = preserveTimeRef.current || startAt || 0;
    let networkRetryCount = 0;
    let mediaErrorCount = 0;
    const MAX_NETWORK_RETRIES = 3;
    let retryTimer: NodeJS.Timeout | null = null;

    if (Hls.isSupported()) {
      const hls = new Hls({
        enableWorker: true,
        lowLatencyMode: false,
        backBufferLength: 60,
        maxBufferLength: 180,
        maxMaxBufferLength: 600,
        maxBufferSize: 150 * 1000 * 1000,
        highBufferWatchdogPeriod: 2,
        maxBufferHole: 0.5,
        nudgeMaxRetry: 10,
        nudgeOffset: 0.15,
        manifestLoadingTimeOut: 30000,
        manifestLoadingMaxRetry: 6,
        levelLoadingTimeOut: 30000,
        levelLoadingMaxRetry: 6,
        fragLoadingTimeOut: 30000,
        fragLoadingMaxRetry: 8,
      });

      const detachAvSync = attachAvSyncGuard(hls, video);

      hls.loadSource(streamUrl);
      hls.attachMedia(video);

      hls.on(Hls.Events.MANIFEST_PARSED, (_, data) => {
        setIsLoading(false);
        networkRetryCount = 0;
        mediaErrorCount = 0;
        const levels = data.levels.map((lvl, index) => ({
          index,
          name: lvl.height ? `${lvl.height}p` : `Level ${index + 1}`,
          height: lvl.height || 0,
        }));
        setHlsLevels(levels);

        if (startPos > 0) {
          video.currentTime = startPos;
        }

        video.play().catch(() => {
          setIsPlaying(false);
        });
      });

      hls.on(Hls.Events.BUFFER_APPENDED, () => {
        setIsLoading(false);
      });

      hls.on(Hls.Events.FRAG_LOADED, () => {
        networkRetryCount = 0;
        mediaErrorCount = 0;
      });

      hls.on(Hls.Events.ERROR, (_, data) => {
        const httpStatus = data.response?.code;
        const isPermanentHttpError =
          httpStatus === 401 ||
          httpStatus === 403 ||
          httpStatus === 404 ||
          httpStatus === 410 ||
          httpStatus === 500 ||
          httpStatus === 502;

        if (data.fatal) {
          switch (data.type) {
            case Hls.ErrorTypes.NETWORK_ERROR:
              // Stop infinite loops on permanent HTTP errors or if max retries exceeded
              if (isPermanentHttpError || networkRetryCount >= MAX_NETWORK_RETRIES) {
                console.warn(
                  `[EmbedPlayer] Fatal network error (${httpStatus || data.details}). Failing over to alternative server...`
                );
                hls.destroy();
                fallbackRef.current?.(
                  httpStatus === 404 || httpStatus === 410 ? "missing" : "error",
                  httpStatus ? `Error del servidor (${httpStatus})` : "No responde"
                );
                break;
              }

              networkRetryCount++;
              const delay = networkRetryCount * 1000;
              console.warn(
                `[EmbedPlayer] Transient network error (${data.details}). Retrying in ${delay}ms (attempt ${networkRetryCount}/${MAX_NETWORK_RETRIES})...`
              );
              if (retryTimer) clearTimeout(retryTimer);
              retryTimer = setTimeout(() => {
                if (hlsRef.current) {
                  hlsRef.current.startLoad();
                }
              }, delay);
              break;

            case Hls.ErrorTypes.MEDIA_ERROR:
              if (mediaErrorCount === 0) {
                mediaErrorCount++;
                console.warn("[EmbedPlayer] Recovering from media error (attempt 1)...");
                hls.recoverMediaError();
              } else if (mediaErrorCount === 1) {
                mediaErrorCount++;
                console.warn("[EmbedPlayer] Swapping audio codec and recovering (attempt 2)...");
                hls.swapAudioCodec();
                hls.recoverMediaError();
              } else {
                console.warn("[EmbedPlayer] Unrecoverable fatal media error. Failing over...");
                hls.destroy();
                fallbackRef.current?.("error", "Vídeo dañado");
              }
              break;

            default:
              console.warn(`[EmbedPlayer] Unrecoverable fatal HLS error (${data.type}, ${data.details}). Failing over...`);
              hls.destroy();
              fallbackRef.current?.();
              break;
          }
        } else {
          // Handle non-fatal buffer stalls to prevent video freezes
          if (data.details === Hls.ErrorDetails.BUFFER_STALLED_ERROR) {
            try {
              hls.startLoad();
            } catch {}
            if (video && !video.paused && video.readyState >= 2) {
              video.currentTime += 0.1;
            }
          } else if (data.details === Hls.ErrorDetails.BUFFER_SEEK_OVER_HOLE) {
            try {
              hls.startLoad();
            } catch {}
          }
        }
      });

      hlsRef.current = hls;
    } else if (video.canPlayType("application/vnd.apple.mpegurl")) {
      video.src = streamUrl;
      video.addEventListener("loadedmetadata", () => {
        setIsLoading(false);
        if (startPos > 0) video.currentTime = startPos;
        video.play().catch(() => setIsPlaying(false));
      });
      video.addEventListener("error", () => {
        fallbackRef.current?.();
      });
    }

    return () => {
      if (retryTimer) clearTimeout(retryTimer);
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
    };
  }, [streamUrl, startAt]);

  // Subtitle cues fetching & parsing (.vtt / .ass / .srt)
  useEffect(() => {
    if (activeSubtitleTrack === null || activeSubtitleTrack === "") {
      setCues([]);
      setCurrentSubtitleText("");
      return;
    }

    const currentSub =
      allAvailableSubtitles.find((s) => s.id === activeSubtitleTrack || s.url === activeSubtitleTrack || (s as any).subtitleUrl === activeSubtitleTrack) ||
      allAvailableSubtitles[0];

    const subUrl = currentSub?.url || (currentSub as any)?.subtitleUrl || (currentSub as any)?.direct_url || (currentSub as any)?.file;
    if (!currentSub || !subUrl) {
      setCues([]);
      setCurrentSubtitleText("");
      return;
    }

    const parseTime = (timeStr: string) => {
      const parts = timeStr.trim().split(":");
      if (parts.length === 3) {
        const [h, m, s] = parts;
        return (parseFloat(h) || 0) * 3600 + (parseFloat(m) || 0) * 60 + (parseFloat(s.replace(",", ".")) || 0);
      } else if (parts.length === 2) {
        const [m, s] = parts;
        return (parseFloat(m) || 0) * 60 + (parseFloat(s.replace(",", ".")) || 0);
      }
      return parseFloat(timeStr.replace(",", ".")) || 0;
    };

    let isMounted = true;
    const fetchUrl = subUrl.startsWith("/api/proxy")
      ? subUrl
      : `/api/proxy/subtitles?url=${encodeURIComponent(subUrl)}`;

    fetch(fetchUrl)
      .then((res) => (res.ok ? res.text() : ""))
      .then((text) => {
        if (!isMounted || !text) return;
        const parsedCues: SubtitleCue[] = [];
        const lines = text.replace(/\r\n/g, "\n").split("\n");
        const isAss = text.includes("[Script Info]") || text.includes("Dialogue:");

        if (isAss) {
          for (const rawLine of lines) {
            const line = rawLine.trim();
            if (!line.startsWith("Dialogue:")) continue;
            const colonIdx = line.indexOf(":");
            if (colonIdx === -1) continue;
            const parts = line.substring(colonIdx + 1).trim().split(",");
            if (parts.length < 9) continue;
            const start = parseTime(parts[1]);
            const end = parseTime(parts[2]);
            const cleanText = parts
              .slice(9)
              .join(",")
              // {\p1} switches to vector drawing ("m 0 0 l 640 0 …") until {\p0}: shapes, not words
              .replace(/\{[^}]*\\p[1-9][^}]*\}[^{]*/g, "")
              .replace(/\{[^}]*\}/g, "")
              .replace(/\\N/gi, "\n")
              .replace(/\\n/gi, "\n")
              .replace(/\\h/gi, " ")
              .trim();
            if (cleanText && end > start) {
              parsedCues.push({ start, end, text: cleanText });
            }
          }
        } else {
          let i = 0;
          while (i < lines.length) {
            const line = lines[i].trim();
            if (line.includes("-->")) {
              const [startPart, endPart] = line.split("-->");
              if (startPart && endPart) {
                const startToken = startPart.trim().split(/\s+/)[0];
                const endToken = endPart.trim().split(/\s+/)[0];
                const start = parseTime(startToken);
                const end = parseTime(endToken);
                i++;
                const textLines: string[] = [];
                while (i < lines.length && lines[i].trim() !== "") {
                  textLines.push(lines[i].trim().replace(/<[^>]*>/g, ""));
                  i++;
                }
                const cueContent = textLines.join("\n").trim();
                if (cueContent && end > start) {
                  parsedCues.push({ start, end, text: cueContent });
                }
              }
            }
            i++;
          }
        }
        if (isMounted) {
          setCues(parsedCues);
        }
      })
      .catch(() => {});

    return () => {
      isMounted = false;
    };
  }, [activeSubtitleTrack, allAvailableSubtitles]);

  // Video Time Update & Subtitle Cue Sync
  const handleTimeUpdate = () => {
    const video = videoRef.current;
    if (!video) return;
    const current = video.currentTime;
    const dur = video.duration || 0;
    setCurrentTime(current);
    if (dur > 0 && duration === 0) {
      setDuration(dur);
    }

    if (dur > 0 && video.buffered.length > 0) {
      for (let i = 0; i < video.buffered.length; i++) {
        if (video.buffered.start(i) <= current && current <= video.buffered.end(i)) {
          setBuffered(video.buffered.end(i));
          break;
        }
      }
    }

    // Sync subtitle cue
    if (cues.length > 0) {
      const active = cues.find((c) => current >= c.start && current <= c.end);
      setCurrentSubtitleText(active ? active.text : "");
    } else {
      setCurrentSubtitleText("");
    }

    // Auto-skip Intro
    // In a room only the host's player auto-skips, and as a jump for everyone
    const roomSync = syncRef.current;
    const mayAutoSkip = !roomSync || roomSync.canSeek;
    if (autoSkipState && mayAutoSkip && skipTimes.intro && !hasAutoSkippedIntroRef.current) {
      if (current >= skipTimes.intro.start && current < skipTimes.intro.end - 1) {
        hasAutoSkippedIntroRef.current = true;
        const target = Math.min(skipTimes.intro.end + 0.5, dur || skipTimes.intro.end + 1);
        if (roomSync) roomSync.onSeek(target);
        else video.currentTime = target;
        setCurrentTime(target);
        setAutoSkipToast("Intro saltada");
        setTimeout(() => setAutoSkipToast(null), 3000);
        return;
      }
    }

    // Auto-skip Outro
    if (autoSkipOutroState && mayAutoSkip && skipTimes.outro && !hasAutoSkippedOutroRef.current) {
      if (current >= skipTimes.outro.start && current < skipTimes.outro.end - 1) {
        hasAutoSkippedOutroRef.current = true;
        const target = Math.min(skipTimes.outro.end + 0.5, dur || skipTimes.outro.end + 1);
        if (roomSync) roomSync.onSeek(target);
        else video.currentTime = target;
        setCurrentTime(target);
        setAutoSkipToast("Ending saltado");
        setTimeout(() => setAutoSkipToast(null), 3000);
        return;
      }
    }

    if (skipTimes.intro && current < skipTimes.intro.start - 5) {
      hasAutoSkippedIntroRef.current = false;
    }
    if (skipTimes.outro && current < skipTimes.outro.start - 5) {
      hasAutoSkippedOutroRef.current = false;
    }

    // Playing-state snapshot emitted every five seconds
    const now = Date.now();
    if (now - lastProgressEmitRef.current >= 5000) {
      lastProgressEmitRef.current = now;
      postToParent("progress", {
        currentTime: Math.round(current * 100) / 100,
        duration: Math.round(dur * 100) / 100,
        buffered: Math.round(buffered * 100) / 100,
        percentage: dur > 0 ? Math.round((current / dur) * 1000) / 10 : 0,
        paused: false,
      });
    }

    if (!progressSaveTimer.current) {
      progressSaveTimer.current = setTimeout(() => {
        try {
          localStorage.setItem(
            progressKey,
            JSON.stringify({ currentTime: Math.floor(current), duration: Math.floor(dur), updatedAt: Date.now() })
          );
        } catch {}
        progressSaveTimer.current = null;
      }, 4000);
    }

    if (dur > 0 && current / dur >= 0.9) syncMalProgress();
  };

  // Play / Pause toggler
  const togglePlay = () => {
    const video = videoRef.current;
    if (!video) return;

    if (video.muted || isMuted) {
      video.muted = false;
      setIsMuted(false);
      try {
        localStorage.setItem("anime_player_muted", "false");
      } catch {}
    }

    // In a room the room plays and pauses every player, this one included
    if (syncRef.current) {
      if (video.paused) syncRef.current.onPlay(video.currentTime);
      else syncRef.current.onPause(video.currentTime);
      return;
    }

    if (video.paused) {
      video.play().catch(() => {});
      setIsPlaying(true);
      postToParent("PLAYER_EVENT", { type: "play" });
    } else {
      video.pause();
      setIsPlaying(false);
      postToParent("PLAYER_EVENT", { type: "pause" });
    }
  };

  // Seek handler
  const handleSeek = (seconds: number) => {
    const video = videoRef.current;
    if (!video) return;
    const target = Math.min(Math.max(seconds, 0), duration || 100);
    // In a room only the host jumps, and the room moves every player
    if (syncRef.current) {
      if (syncRef.current.canSeek) syncRef.current.onSeek(target);
      else showToast("info", "En la sala solo el anfitrión puede avanzar o retroceder");
      return;
    }
    video.currentTime = target;
    setCurrentTime(target);
    postToParent("PLAYER_EVENT", { type: "seeked", currentTime: target });
  };

  const handleSeekRelative = (seconds: number) => {
    if (syncRef.current && !syncRef.current.canSeek) return handleSeek(0);
    const video = videoRef.current;
    const cur = video ? video.currentTime : currentTime;
    const target = Math.min(Math.max(0, cur + seconds), duration || 100);
    handleSeek(target);

    const side = seconds >= 0 ? "right" : "left";
    setSeekFeedback((prev) => ({
      side,
      amount: (prev?.side === side ? prev.amount : 0) + Math.abs(seconds),
    }));
    if (seekFeedbackTimerRef.current) clearTimeout(seekFeedbackTimerRef.current);
    seekFeedbackTimerRef.current = setTimeout(() => {
      setSeekFeedback(null);
    }, 700);
  };

  // Skip Intro / Outro actions
  const handleSkipIntro = () => {
    if (!videoRef.current || !skipTimes.intro) return;
    const targetTime = Math.min(skipTimes.intro.end + 0.5, duration || skipTimes.intro.end + 1);
    handleSeek(targetTime);
    showToast("info", "Intro saltada");
  };

  const handleSkipOutro = () => {
    if (!videoRef.current || !skipTimes.outro) return;
    const targetTime = Math.min(skipTimes.outro.end + 0.5, duration || skipTimes.outro.end + 1);
    handleSeek(targetTime);
    showToast("info", "Ending saltado");
  };

  // Volume & Mute handlers
  const handleVolumeChange = (newVolume: number) => {
    const vol = Math.min(Math.max(newVolume, 0), 1);
    if (videoRef.current) {
      videoRef.current.volume = vol;
      videoRef.current.muted = vol === 0;
    }
    setVolume(vol);
    setIsMuted(vol === 0);
    try {
      localStorage.setItem("anime_player_volume", vol.toString());
      localStorage.setItem("anime_player_muted", (vol === 0).toString());
    } catch {}
  };

  const toggleMute = () => {
    const video = videoRef.current;
    if (!video) return;
    const newMuted = !isMuted;
    video.muted = newMuted;
    if (!newMuted && volume === 0) {
      video.volume = 0.5;
      setVolume(0.5);
    }
    setIsMuted(newMuted);
    try {
      localStorage.setItem("anime_player_muted", newMuted.toString());
    } catch {}
  };

  // Fullscreen toggler - locks to 16:9 landscape on mobile phones
  const toggleFullscreen = async () => {
    // The whole page goes full screen, not the player: moving to the next episode mounts a new
    // player, and the browser would leave full screen with the old one
    const el = document.documentElement;
    const video = videoRef.current;
    if (!containerRef.current) return;
    const isFs = Boolean(
      document.fullscreenElement ||
      (document as any).webkitFullscreenElement
    );

    if (!isFs) {
      // On iOS iPhone Safari: use webkitEnterFullscreen which native-locks to 16:9 landscape
      const isIPhone = typeof navigator !== "undefined" && /iPhone|iPod/.test(navigator.userAgent);
      if (isIPhone && video && (video as any).webkitEnterFullscreen) {
        try {
          (video as any).webkitEnterFullscreen();
          setIsFullscreen(true);
          return;
        } catch (err) {
          console.warn("webkitEnterFullscreen fallback", err);
        }
      }

      const requestFs =
        el.requestFullscreen ||
        (el as any).webkitRequestFullscreen ||
        (el as any).mozRequestFullScreen ||
        (el as any).msRequestFullscreen;

      if (requestFs) {
        try {
          await requestFs.call(el);
        } catch {}
      }
      setIsFullscreen(true);

      // Lock orientation to 16:9 landscape on mobile devices
      try {
        if (screen.orientation && (screen.orientation as any).lock) {
          await (screen.orientation as any).lock("landscape");
        }
      } catch {}
    } else {
      const exitFs =
        document.exitFullscreen ||
        (document as any).webkitExitFullscreen ||
        (document as any).mozCancelFullScreen ||
        (document as any).msExitFullscreen;

      if (exitFs) {
        try {
          await exitFs.call(document);
        } catch {}
      }
      setIsFullscreen(false);

      try {
        if (screen.orientation && (screen.orientation as any).unlock) {
          (screen.orientation as any).unlock();
        }
      } catch {}
    }
  };

  // Picture in Picture
  const togglePiP = async () => {
    const video = videoRef.current;
    if (!video) return;
    try {
      if (document.pictureInPictureElement) {
        await document.exitPictureInPicture();
      } else if (video.requestPictureInPicture) {
        await video.requestPictureInPicture();
      }
    } catch {}
  };

  // Subtitle toggler
  const toggleSubtitles = () => {
    if (activeSubtitleTrack !== null) {
      setActiveSubtitleTrack(null);
      showToast("info", "Subtítulos desactivados");
    } else {
      const defaultSub = allAvailableSubtitles[0];
      const target = defaultSub ? defaultSub.id || defaultSub.url : "en";
      setActiveSubtitleTrack(target);
      showToast("info", `Subtítulos: ${defaultSub ? subtitleLabel(defaultSub) : "activados"}`);
    }
  };

  const toggleTimeDisplay = () => {
    setShowRemainingTime((prev) => !prev);
  };

  const handleSelectQuality = (lvlIndex: number) => {
    if (hlsRef.current) {
      hlsRef.current.currentLevel = lvlIndex;
      setSelectedHlsLevel(lvlIndex);
      const lvl = hlsLevels.find((l) => l.index === lvlIndex);
      showToast("success", `Calidad: ${lvl ? lvl.name : "automática"}`);
    }
  };

  // Mobile touch handler: Smart single-tap controls toggle & double-tap seek
  const handleTouchEnd = (e: React.TouchEvent<HTMLDivElement>) => {
    lastTouchTimeRef.current = Date.now();
    const touch = e.changedTouches[0];
    if (!touch || !containerRef.current) return;

    // Do not toggle or seek if user tapped on interactive control buttons, sliders or menus
    if (isControlTarget(e.target as HTMLElement)) {
      handleUserActivity();
      return;
    }
    if (panelOpenRef.current) {
      closePanel();
      return;
    }

    const rect = containerRef.current.getBoundingClientRect();
    const x = touch.clientX - rect.left;
    const width = rect.width;
    const now = Date.now();
    const lastTap = lastTapInfoRef.current;

    // Detect true double-tap: within 320ms and within 45px radius
    const isDoubleTap =
      lastTap &&
      now - lastTap.time < 320 &&
      Math.abs(touch.clientX - lastTap.x) < 45 &&
      Math.abs(touch.clientY - lastTap.y) < 45;

    if (isDoubleTap) {
      lastTapInfoRef.current = null;
      if (singleTapTimerRef.current) {
        clearTimeout(singleTapTimerRef.current);
        singleTapTimerRef.current = null;
      }

      if (x < width * 0.4) {
        // Double-tap left: seek -10s
        const cur = videoRef.current ? videoRef.current.currentTime : currentTime;
        handleSeek(cur - 10);
        setSeekFeedback((prev) => ({
          side: "left",
          amount: prev?.side === "left" ? prev.amount + 10 : 10,
        }));
        if (seekFeedbackTimerRef.current) clearTimeout(seekFeedbackTimerRef.current);
        seekFeedbackTimerRef.current = setTimeout(() => setSeekFeedback(null), 700);
        handleUserActivity();
        return;
      }

      if (x > width * 0.6) {
        // Double-tap right: seek +10s
        const cur = videoRef.current ? videoRef.current.currentTime : currentTime;
        handleSeek(cur + 10);
        setSeekFeedback((prev) => ({
          side: "right",
          amount: prev?.side === "right" ? prev.amount + 10 : 10,
        }));
        if (seekFeedbackTimerRef.current) clearTimeout(seekFeedbackTimerRef.current);
        seekFeedbackTimerRef.current = setTimeout(() => setSeekFeedback(null), 700);
        handleUserActivity();
        return;
      }

      // Double-tap center: toggle play/pause
      togglePlay();
      handleUserActivity();
      return;
    }

    // Record potential first tap
    lastTapInfoRef.current = { time: now, x: touch.clientX, y: touch.clientY };

    if (singleTapTimerRef.current) clearTimeout(singleTapTimerRef.current);
    singleTapTimerRef.current = setTimeout(() => {
      singleTapTimerRef.current = null;
      lastTapInfoRef.current = null;

      const wasControlsVisible = showControlsRef.current;
      // Always show/keep controls visible and wait 3s before auto-hiding - just like on PC!
      handleUserActivity();

      // If controls were already visible, tapping the screen toggles play/pause (just like on PC!)
      if (wasControlsVisible) {
        togglePlay();
      }
    }, 250);
  };

  const isInsideIntro = Boolean(
    skipTimes.intro &&
      currentTime >= skipTimes.intro.start &&
      currentTime <= skipTimes.intro.end
  );
  const isInsideOutro = Boolean(
    skipTimes.outro &&
      currentTime >= skipTimes.outro.start &&
      currentTime <= skipTimes.outro.end
  );


  const canPlayNext = Boolean(onNextEpisode && nextEpisode);
  const panelOpenerRef = useRef<HTMLElement | null>(null);

  const openPanel = (view: PanelView = "main") => {
    panelOpenerRef.current = document.activeElement as HTMLElement | null;
    setPanelView(view);
    setShowControls(true);
  };

  const closePanel = () => {
    setPanelView(null);
    // Remote users get their place back in the control row
    const opener = panelOpenerRef.current;
    if (tv && opener?.isConnected) setTimeout(() => opener.focus({ preventScroll: true }), 0);
  };

  const showNextUp = useCallback(
    (seconds: number) => {
      setNextUp(true);
      setNextCountdown(autoplayNext ? seconds : null);
      setPanelView(null);
    },
    [autoplayNext]
  );

  const dismissNextUp = () => {
    nextUpDismissedRef.current = true;
    setNextUp(false);
    setNextCountdown(null);
  };

  const playNext = () => {
    setNextCountdown(null);
    onNextEpisode?.();
  };

  // Back on the remote or Escape: steps out of whatever is open. False when nothing was,
  // so the library leaves the player
  const handleBack = (): boolean => {
    if (panelView !== null) {
      if (panelView === "style") setPanelView("subtitles");
      else if (panelView !== "main") setPanelView("main");
      else closePanel();
      return true;
    }
    if (nextUp) {
      dismissNextUp();
      return true;
    }
    if (tv && controlsRef.current?.contains(document.activeElement)) {
      (document.activeElement as HTMLElement).blur();
      if (isPlayingRef.current) setShowControls(false);
      return true;
    }
    // Leaving goes through onBack, so the page can fade the player out first
    if (tv && onBack) {
      onBack();
      return true;
    }
    return false;
  };
  useBackHandler(tv ? handleBack : null);

  // Clicks and taps outside the controls: close Ajustes first, otherwise play / pause
  const isControlTarget = (target: HTMLElement) =>
    Boolean(
      target.closest("button") ||
        target.closest("a") ||
        target.closest("input") ||
        target.closest("[role='slider']") ||
        target.closest("[role='dialog']") ||
        target.closest("[data-controls-bar='true']")
    );

  // Desktop click to play / pause
  const handleScreenClick = (e: React.MouseEvent<HTMLElement>) => {
    if (Date.now() - lastTouchTimeRef.current < 500) return;
    if (isControlTarget(e.target as HTMLElement)) return;
    if (panelOpenRef.current) {
      closePanel();
      return;
    }
    handleUserActivity();
    togglePlay();
  };

  const handleDoubleClick = (e: React.MouseEvent) => {
    if (Date.now() - lastTouchTimeRef.current < 800) return;
    if (isControlTarget(e.target as HTMLElement) || panelOpenRef.current) return;
    toggleFullscreen();
  };

  // Keyboard and remote controls
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const active = document.activeElement as HTMLElement | null;
      if (
        active &&
        (active.tagName === "INPUT" || active.tagName === "TEXTAREA" || active.tagName === "SELECT")
      ) {
        return;
      }
      // TV remotes have no pointer to wake the controls, so any key does
      handleUserActivity();

      // On TV the library resolves Back first (capture phase) and marks it handled
      if (isBackKey(e)) {
        if (!e.defaultPrevented && e.key === "Escape" && handleBack()) e.preventDefault();
        return;
      }

      const media = getMediaAction(e);
      if (media) {
        e.preventDefault();
        if (media === "toggle" || (media === "play" && !isPlaying) || (media === "pause" && isPlaying)) {
          togglePlay();
        } else if (media === "forward") {
          handleSeekRelative(10);
        } else if (media === "rewind") {
          handleSeekRelative(-10);
        }
        return;
      }

      // OK presses the focused control. Done here because the phone remote sends synthetic key
      // events, which never activate a button on their own
      if (
        e.key === "Enter" &&
        active &&
        (active.tagName === "BUTTON" || active.tagName === "A") &&
        containerRef.current?.contains(active)
      ) {
        e.preventDefault();
        active.click();
        return;
      }

      // Inside a focus group (TV row, pause and up-next buttons, Ajustes) the arrows move focus
      const group = active?.closest<HTMLElement>("[data-nav]");
      if (group) {
        if (e.key.startsWith("Arrow")) {
          e.preventDefault();
          const step = arrowStep(e.key, group.dataset.nav as NavAxis);
          if (step !== null) moveFocus(group, step);
          // Up from the TV control row hands the arrows back to seeking
          else if (e.key === "ArrowUp" && group.dataset.navExit === "up") active?.blur();
          return;
        }
        // Space presses the focused option
        if (e.key === " ") return;
      }

      if (tv && (e.key === "ArrowDown" || e.key === "ArrowUp") && !pauseScreen && !nextUp && panelView === null) {
        e.preventDefault();
        setShowControls(true);
        focusFirst(controlsRef.current?.querySelector<HTMLElement>("[data-nav]") ?? null);
        return;
      }

      switch (e.key.toLowerCase()) {
        case "enter":
          // A focused control outside the player (none in the library) handles its own Enter
          if (active?.tagName === "BUTTON" || active?.tagName === "A") break;
          e.preventDefault();
          togglePlay();
          break;
        case " ":
        case "k":
          e.preventDefault();
          togglePlay();
          break;
        case "f":
          e.preventDefault();
          toggleFullscreen();
          break;
        case "m":
          e.preventDefault();
          toggleMute();
          break;
        case "arrowright":
          e.preventDefault();
          handleSeekRelative(10);
          break;
        case "arrowleft":
          e.preventDefault();
          handleSeekRelative(-10);
          break;
        case "arrowup":
          e.preventDefault();
          handleVolumeChange(volume + 0.05);
          break;
        case "arrowdown":
          e.preventDefault();
          handleVolumeChange(volume - 0.05);
          break;
        case "s":
          if (isInsideIntro) {
            e.preventDefault();
            handleSkipIntro();
          } else if (isInsideOutro) {
            e.preventDefault();
            handleSkipOutro();
          }
          break;
        case "c":
          e.preventDefault();
          toggleSubtitles();
          break;
        case "n":
          if (canPlayNext) {
            e.preventDefault();
            playNext();
          }
          break;
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  });

  // Pause screen: only after the pause has lasted a moment, so a quick pause stays a quick pause
  useEffect(() => {
    if (isPlaying || isLoading || fatalError || nextUp || ended || !duration) {
      setPauseScreen(false);
      return;
    }
    const timer = setTimeout(() => setPauseScreen(true), PAUSE_SCREEN_DELAY);
    return () => clearTimeout(timer);
  }, [isPlaying, isLoading, fatalError, nextUp, ended, duration]);

  // Up next when the ending starts; after "Ver los créditos" it waits for the end of the video
  useEffect(() => {
    if (!canPlayNext || nextUp || nextUpDismissedRef.current || !skipTimes.outro || !duration) return;
    if (currentTime >= skipTimes.outro.start && currentTime < duration - 1) showNextUp(NEXT_COUNTDOWN);
  }, [canPlayNext, nextUp, skipTimes.outro, currentTime, duration, showNextUp]);

  useEffect(() => {
    if (!nextUp || nextCountdown === null) return;
    if (nextCountdown <= 0) {
      onNextEpisode?.();
      return;
    }
    const timer = setTimeout(() => setNextCountdown((n) => (n === null ? null : n - 1)), 1000);
    return () => clearTimeout(timer);
  }, [nextUp, nextCountdown, onNextEpisode]);

  // TV: the skip button takes OK while it's on screen, unless the remote is busy elsewhere
  const showSkip = (isInsideIntro || isInsideOutro) && !pauseScreen && !nextUp;
  useEffect(() => {
    if (!tv || !showSkip) return;
    const active = document.activeElement;
    if (!active || active === document.body) skipButtonRef.current?.focus({ preventScroll: true });
  }, [tv, showSkip]);

  // Keep isPlayingRef updated and trigger auto-hide
  useEffect(() => {
    isPlayingRef.current = isPlaying;
    if (isPlaying) {
      handleUserActivity();
    } else {
      setShowControls(true);
      if (hideControlsTimer.current) clearTimeout(hideControlsTimer.current);
    }
  }, [isPlaying, handleUserActivity]);

  useEffect(() => {
    showControlsRef.current = showControls;
  }, [showControls]);

  // Fullscreen change listener
  useEffect(() => {
    const handleFsChange = () => {
      const isFs = Boolean(
        document.fullscreenElement ||
        (document as any).webkitFullscreenElement
      );
      setIsFullscreen(isFs);
      if (isFs) {
        handleUserActivity();
        try {
          if (screen.orientation && (screen.orientation as any).lock) {
            (screen.orientation as any).lock("landscape").catch(() => {});
          }
        } catch {}
      } else {
        try {
          if (screen.orientation && (screen.orientation as any).unlock) {
            (screen.orientation as any).unlock();
          }
        } catch {}
      }
    };
    // A player that follows another one in full screen starts out in it
    handleFsChange();
    document.addEventListener("fullscreenchange", handleFsChange);
    document.addEventListener("webkitfullscreenchange", handleFsChange);
    return () => {
      document.removeEventListener("fullscreenchange", handleFsChange);
      document.removeEventListener("webkitfullscreenchange", handleFsChange);
    };
  }, [handleUserActivity]);

  // Leaving the player leaves full screen too, but not when the next episode's player takes over
  useEffect(() => {
    mountedPlayers++;
    return () => {
      mountedPlayers--;
      setTimeout(() => {
        if (mountedPlayers > 0 || document.fullscreenElement !== document.documentElement) return;
        document.exitFullscreen?.().catch(() => {});
      }, FULLSCREEN_HANDOVER_MS);
    };
  }, []);

  const currentSub =
    activeSubtitleTrack === null
      ? null
      : allAvailableSubtitles.find((s) => s.id === activeSubtitleTrack || s.url === activeSubtitleTrack) ||
        allAvailableSubtitles[0];

  const getSourceProvider = useCallback((src: VideoSourceData) => {
    const sId = (src.id || "").toLowerCase();
    const sName = (src.serverName || "").toLowerCase();
    const sUrl = (src.videoUrl || "").toLowerCase();

    // 0. Buzz from Megaplay
    if (
      sId.includes("buzz") ||
      sName.includes("buzz") ||
      sUrl.includes("server=buzz") ||
      sId.includes("megaplay") ||
      sName.includes("megaplay") ||
      sUrl.includes("megaplay")
    ) {
      return "Buzz";
    }

    // 1. Zuri from Extractor
    if (
      sId.includes("zuri") ||
      sName.includes("zuri") ||
      sUrl.includes("provider=zuri") ||
      sId.includes("zuna") ||
      sName.includes("zuna") ||
      sUrl.includes("provider=zuna")
    ) {
      return "Zuri";
    }

    // 2. Yuri from Extractor
    if (
      sId.includes("yuri") ||
      sName.includes("yuri") ||
      sUrl.includes("provider=yuri") ||
      sId.includes("yuki") ||
      sName.includes("yuki") ||
      sUrl.includes("provider=yuki")
    ) {
      return "Yuri";
    }

    // 3. Kitty (Flow 2 / HD-2)
    if (
      sId.includes("kitty") ||
      sName.includes("kitty") ||
      sUrl.includes("server=kitty") ||
      sId.includes("flow-2") ||
      sName.includes("flow 2") ||
      sName.includes("hd-2") ||
      sUrl.includes("server=hd-2")
    ) {
      return "Kitty";
    }

    // 4. Flow (default for all Re:ANIME / HD-1 / Flow streams)
    return "Flow";
  }, []);

  const sortSourcesByProvider = useCallback((a: VideoSourceData, b: VideoSourceData) => {
    const SERVER_SORT_ORDER = ["flow", "kitty", "yuri", "zuri", "buzz"];
    const provA = getSourceProvider(a).toLowerCase();
    const provB = getSourceProvider(b).toLowerCase();
    const idxA = SERVER_SORT_ORDER.indexOf(provA);
    const idxB = SERVER_SORT_ORDER.indexOf(provB);
    const orderA = idxA === -1 ? 99 : idxA;
    const orderB = idxB === -1 ? 99 : idxB;
    return orderA - orderB;
  }, [getSourceProvider]);

  // Native player sources segregated for SUB and DUB
  const nativeSubSources = useMemo<VideoSourceData[]>(() => {
    const raw = sources.filter((s) => s.type === "SUB" && isNativePlayerSource(s));
    const list = raw.length > 0 ? raw : (sources.some(isNativePlayerSource) ? [] : sources.filter((s) => s.type === "SUB"));
    const byProv = new Map<string, VideoSourceData>();
    for (const s of list) {
      const prov = getSourceProvider(s).toLowerCase();
      const existing = byProv.get(prov);
      // Prefer direct proxied stream URL over generic route URL
      if (!existing || (existing.videoUrl.includes("format=m3u8") && !s.videoUrl.includes("format=m3u8"))) {
        byProv.set(prov, s);
      }
    }
    return Array.from(byProv.values()).sort(sortSourcesByProvider);
  }, [sources, getSourceProvider, sortSourcesByProvider]);

  const nativeDubSources = useMemo<VideoSourceData[]>(() => {
    // Strictly NO Zuri (Zuri is Japanese SUB ONLY) and filter out upstream audio fallbacks
    const isAuthenticDub = (s: VideoSourceData) => {
      if ((s as any).audio_fallback) return false;
      const prov = getSourceProvider(s).toLowerCase();
      return prov !== "zuri";
    };
    const raw = sources.filter((s) => s.type === "DUB" && isNativePlayerSource(s) && isAuthenticDub(s));
    const list = raw.length > 0 ? raw : (sources.some(isNativePlayerSource) ? [] : sources.filter((s) => s.type === "DUB" && isAuthenticDub(s)));
    const byProv = new Map<string, VideoSourceData>();
    for (const s of list) {
      const prov = getSourceProvider(s).toLowerCase();
      const existing = byProv.get(prov);
      // Prefer direct proxied stream URL over generic route URL
      if (!existing || (existing.videoUrl.includes("format=m3u8") && !s.videoUrl.includes("format=m3u8"))) {
        byProv.set(prov, s);
      }
    }
    return Array.from(byProv.values()).sort(sortSourcesByProvider);
  }, [sources, getSourceProvider, sortSourcesByProvider]);

  const currentSource = useMemo(() => {
    if (activeSourceId) {
      const found = sources.find((s) => s.id === activeSourceId);
      if (found) return found;
    }
    const forType = sources.filter((s) => s.type.toLowerCase() === selectedType.toLowerCase());
    return forType[0] || sources[0] || null;
  }, [sources, activeSourceId, selectedType]);

  const formatServerRouteName = useCallback((src: VideoSourceData) => {
    return getSourceProvider(src);
  }, [getSourceProvider]);

  const formatServerRouteAudio = useCallback((src: VideoSourceData) => {
    return src.type === "DUB" ? "English Dub" : "Sub";
  }, []);

  const formatServerRouteLabel = useCallback((src: VideoSourceData) => {
    const name = formatServerRouteName(src);
    const audio = formatServerRouteAudio(src);
    return `${name} (${audio})`;
  }, [formatServerRouteName, formatServerRouteAudio]);

  const activeServerLabel = useMemo(() => {
    if (currentSource) {
      return formatServerRouteLabel(currentSource);
    }
    return selectedType === "dub" ? "Flow (English Dub)" : "Flow (Sub)";
  }, [currentSource, formatServerRouteLabel, selectedType]);

  const handleSelectSource = useCallback((src: VideoSourceData) => {
    const curTime = videoRef.current && videoRef.current.currentTime > 0
      ? videoRef.current.currentTime
      : currentTime;
    if (curTime > 0) {
      preserveTimeRef.current = curTime;
    }
    isSwitchingServerRef.current = true;
    setFatalError(null);
    setIsLoading(true);

    const newType = src.type.toLowerCase() as "sub" | "dub";
    if (newType !== selectedType) {
      setSelectedType(newType);
    }

    const prov = getSourceProvider(src).toLowerCase();
    let srvCode = "flow";
    if (prov.includes("buzz") || prov.includes("megaplay")) srvCode = "buzz";
    else if (prov.includes("zuri") || prov.includes("zuna")) srvCode = "zuri";
    else if (prov.includes("yuri") || prov.includes("yuki")) srvCode = "yuri";
    else if (prov.includes("kitty") || prov.includes("flow-2") || prov.includes("hd-2")) srvCode = "kitty";
    setServer(srvCode);

    // Apply skip times specifically for the newly selected server
    const isFlowSrc = srvCode === "flow" || srvCode === "kitty";
    if (src.intro || src.outro) {
      setRawSkipTimes({
        intro: src.intro || null,
        outro: src.outro || null,
        refDuration: src.refDuration || 1440,
        source: isFlowSrc ? "flow-reanime" : "aniskip",
      });
      if (isFlowSrc && duration > 0) {
        const adapted = adaptSkipTimes(src.intro || null, src.outro || null, src.refDuration || 1440, duration);
        setSkipTimes({ intro: adapted.intro, outro: adapted.outro });
      } else {
        setSkipTimes({ intro: src.intro || null, outro: src.outro || null });
      }
    } else {
      // Reload server-scoped skip times without inheriting Flow timestamps
      const idParam = anilistId ? `anilistId=${anilistId}` : `malId=${malId}`;
      const titleParam = animeTitle ? `&title=${encodeURIComponent(animeTitle)}` : "";
      fetch(`/api/anime/skip-times?${idParam}&episode=${episodeNumber}${titleParam}&server=${srvCode}`)
        .then((r) => r.json())
        .then((d) => {
          if (d.found && (d.intro || d.outro)) {
            setRawSkipTimes({
              intro: d.intro || null,
              outro: d.outro || null,
              refDuration: d.refDuration || 1440,
              source: d.source || (isFlowSrc ? "flow-reanime" : "aniskip"),
            });
            if (isFlowSrc && duration > 0) {
              const adapted = adaptSkipTimes(d.intro || null, d.outro || null, d.refDuration || 1440, duration);
              setSkipTimes({ intro: adapted.intro, outro: adapted.outro });
            } else {
              setSkipTimes({ intro: d.intro || null, outro: d.outro || null });
            }
          } else {
            setRawSkipTimes({ intro: null, outro: null, refDuration: 1440, source: isFlowSrc ? "flow-reanime" : "aniskip" });
            setSkipTimes({ intro: null, outro: null });
          }
        })
        .catch(() => {});
    }

    setActiveSourceId(src.id);
    setStreamUrl(src.videoUrl);

    const rawSubsList = (src.subtitles && src.subtitles.length > 0)
      ? src.subtitles
      : sources.find((s) => getSourceProvider(s).toLowerCase() === prov && Array.isArray(s.subtitles) && s.subtitles.length > 0)?.subtitles;

    if (rawSubsList && rawSubsList.length > 0) {
      const formattedSubs: SubtitleTrack[] = rawSubsList.map((s: any, idx: number) => {
        const rawUrl = s.url || s.subtitleUrl || s.file || s.direct_url || s.link || "";
        const proxySubUrl = rawUrl
          ? (rawUrl.startsWith("/api/proxy") ? rawUrl : `/api/proxy/subtitles?url=${encodeURIComponent(rawUrl)}`)
          : "";
        return {
          id: s.id || `sub-${idx}`,
          language: s.language || s.lang || "en",
          label: s.label || s.language || `Subtitle ${idx + 1}`,
          url: proxySubUrl || rawUrl,
          default: s.default ?? s.isDefault ?? (idx === 0),
        };
      }).filter((s) => Boolean(s.url));

      if (formattedSubs.length > 0) {
        setAllAvailableSubtitles(formattedSubs);
        setActiveSubtitleTrack(pickSubtitleTrack(formattedSubs, newType, getPlaybackPreferences()));
      }
    }

    // Always fetch fresh subtitles asynchronously for the chosen server in case they weren't attached yet
    const subIdParam = anilistId ? `anilistId=${anilistId}` : `malId=${malId}`;
    const subEpParam = `episode=${episodeNumber}`;
    fetch(`/api/play?${subIdParam}&${subEpParam}&audio=${newType}&server=${srvCode}`)
      .then((r) => r.json())
      .then((data) => {
        if (data?.subtitles && Array.isArray(data.subtitles) && data.subtitles.length > 0) {
          const fetchedSubs: SubtitleTrack[] = data.subtitles
            .map((s: any, idx: number) => {
              const rawUrl = s.url || s.subtitleUrl || s.file || s.direct_url || s.link || "";
              const proxySubUrl = rawUrl
                ? (rawUrl.startsWith("/api/proxy") ? rawUrl : `/api/proxy/subtitles?url=${encodeURIComponent(rawUrl)}`)
                : "";
              return {
                id: s.id || `sub-${idx}`,
                language: s.language || s.lang || "en",
                label: s.label || s.language || `Subtitle ${idx + 1}`,
                url: proxySubUrl || rawUrl,
                default: s.default ?? s.isDefault ?? (idx === 0),
              };
            })
            .filter((s: SubtitleTrack) => Boolean(s.url));

          if (fetchedSubs.length > 0) {
            setAllAvailableSubtitles(fetchedSubs);
            // Generated ids (sub-0, sub-1…) repeat across servers, so pick by language again
            // rather than keeping the previous id
            setActiveSubtitleTrack(pickSubtitleTrack(fetchedSubs, newType, getPlaybackPreferences()));
            setSources((prev) =>
              prev.map((item) =>
                item.id === src.id ? { ...item, subtitles: fetchedSubs } : item
              )
            );
          }
        }
      })
      .catch(() => {});

    showToast("success", `Cambiado a ${formatServerRouteName(src)}${src.type === "DUB" ? " (doblaje)" : ""}`);

    postToParent("PLAYER_EVENT", {
      type: "source_change",
      sourceId: src.id,
      serverName: src.serverName,
      audio: newType,
      videoUrl: src.videoUrl,
    });
  }, [currentTime, selectedType, getSourceProvider, formatServerRouteName, showToast, postToParent, duration, rawSkipTimes]);

  // Each server is tried once: going round the list again (the old `(index + 1) % length`) kept
  // switching forever when none had the episode, e.g. one that has only just aired
  const handleFallbackToNextServer = useCallback(
    (reason: TriedServer["reason"] = "error", detail?: string) => {
      // Offline, every server would fail: wait for the connection instead of using them up
      if (typeof navigator !== "undefined" && navigator.onLine === false) {
        failPlayback("offline", "No hay conexión a internet");
        return;
      }
      const available = selectedType === "dub" ? nativeDubSources : nativeSubSources;
      const current = available.find((s) => s.id === activeSourceId || s.videoUrl === streamUrl);
      if (current) triedRef.current.set(current.id, { name: getSourceProvider(current), reason, detail });

      const nextServer = available.find((s) => !triedRef.current.has(s.id));
      if (nextServer) {
        console.warn(`[EmbedPlayer] Auto-failing over to alternative server: ${formatServerRouteName(nextServer)}`);
        showToast("refreshing", `Probando con ${formatServerRouteName(nextServer)}…`);
        handleSelectSource(nextServer);
        return;
      }

      const tried = Array.from(triedRef.current.values());
      const noneHasIt = tried.length > 0 && tried.every((t) => t.reason === "missing");
      failPlayback(
        noneHasIt ? "unavailable" : "failed",
        noneHasIt ? "Ningún servidor tiene este episodio ahora mismo" : "No se ha podido reproducir en ningún servidor"
      );
    },
    [selectedType, nativeDubSources, nativeSubSources, activeSourceId, streamUrl, getSourceProvider, formatServerRouteName, showToast, handleSelectSource, failPlayback]
  );

  useEffect(() => {
    fallbackRef.current = handleFallbackToNextServer;
  }, [handleFallbackToNextServer]);

  // The error screen tries again on its own: every few minutes while no server has the episode
  // yet, as soon as the connection is back, and once an episode still ahead airs
  useEffect(() => {
    if (!fatalError) return;
    if (errorKind === "offline") {
      window.addEventListener("online", retryPlayback);
      return () => window.removeEventListener("online", retryPlayback);
    }
    // First hour after it aired (or after the wait began, when the air time is unknown): often
    const since = airingAt ? airingAt * 1000 : waitingSinceRef.current ?? Date.now();
    const every = Date.now() - since < 60 * 60 * 1000 ? RECHECK_FIRST_HOUR_MS : RECHECK_LATER_MS;
    const at =
      errorKind === "unavailable" ? Date.now() + every : errorKind === "not-aired" && airingAt ? airingAt * 1000 : null;
    // setTimeout can't wait much past 24 days; a date that far is checked on the next visit
    if (!at || at - Date.now() > 24 * 86_400_000) return;
    if (errorKind === "unavailable") {
      setNextCheckAt(at);
      setCheckEveryMs(every);
    }
    const timer = setTimeout(retryPlayback, Math.max(0, at - Date.now()));
    return () => clearTimeout(timer);
  }, [fatalError, errorKind, airingAt, retryPlayback]);

  // Current player state snapshot
  const getPlayerState = useCallback(() => {
    const video = videoRef.current;
    const curTime = video && !isNaN(video.currentTime) ? video.currentTime : currentTime;
    const dur = video && !isNaN(video.duration) ? video.duration : duration;
    return {
      currentTime: Math.round((curTime || 0) * 100) / 100,
      duration: Math.round((dur || 0) * 100) / 100,
      paused: video ? video.paused : !isPlaying,
      muted: video ? video.muted : isMuted,
      volume: video ? Math.round(video.volume * 100) / 100 : volume,
      playbackRate: video ? video.playbackRate : playbackSpeed,
      percentage: dur > 0 ? Math.round(((curTime || 0) / dur) * 1000) / 10 : 0,
      provider: {
        language: selectedType,
        providerId: server,
      },
      episode: episodeNumber,
      anilistId,
      malId,
    };
  }, [currentTime, duration, isPlaying, isMuted, volume, playbackSpeed, selectedType, server, episodeNumber, anilistId, malId]);

  // Listen to postMessage from parent iframe / SDK
  useEffect(() => {
    const handleMessage = (e: MessageEvent) => {
      const msg = e.data;
      if (!msg) return;

      const cmdName = msg.name || msg.command || msg.action || (msg.type !== "command" ? msg.type : undefined);
      if (!cmdName || typeof cmdName !== "string") return;

      const cmdData = msg.data || msg;
      const requestId = msg.requestId;

      const sendResult = (ok: boolean, error?: string) => {
        if (!requestId) return;
        const state = getPlayerState();
        if (typeof window !== "undefined" && window.parent && window.parent !== window) {
          window.parent.postMessage(
            {
              source: "aniembed",
              version: 1,
              name: "command-result",
              requestId,
              data: ok ? { ok: true, state } : { ok: false, error: error || "Command execution failed" },
            },
            "*"
          );
        }
      };

      const video = videoRef.current;

      switch (cmdName) {
        case "play": {
          if (video) {
            video
              .play()
              .then(() => {
                setIsPlaying(true);
                sendResult(true);
              })
              .catch((err) => {
                sendResult(false, err?.message || "Playback error");
              });
          } else {
            sendResult(false, "Video element unavailable");
          }
          break;
        }

        case "pause": {
          if (video) {
            video.pause();
            setIsPlaying(false);
            sendResult(true);
          } else {
            sendResult(false, "Video element unavailable");
          }
          break;
        }

        case "seek": {
          const seekTarget = Number(cmdData.time ?? cmdData.seconds ?? 0);
          if (!isNaN(seekTarget)) {
            handleSeek(seekTarget);
            sendResult(true);
          } else {
            sendResult(false, "Invalid seek time parameter");
          }
          break;
        }

        case "setVolume": {
          const targetVol = Number(cmdData.volume ?? 1);
          if (!isNaN(targetVol)) {
            const clamped = Math.max(0, Math.min(1, targetVol));
            if (video) {
              video.volume = clamped;
              if (clamped > 0 && (video.muted || isMuted)) {
                video.muted = false;
                setIsMuted(false);
              }
            }
            setVolume(clamped);
            sendResult(true);
          } else {
            sendResult(false, "Invalid volume parameter (must be 0..1)");
          }
          break;
        }

        case "setMuted": {
          const mutedBool = Boolean(cmdData.muted);
          if (video) {
            video.muted = mutedBool;
          }
          setIsMuted(mutedBool);
          sendResult(true);
          break;
        }

        case "setPlaybackRate": {
          const targetRate = Number(cmdData.rate ?? cmdData.playbackRate ?? 1);
          if (!isNaN(targetRate)) {
            const clampedRate = Math.max(0.25, Math.min(2, targetRate));
            if (video) {
              video.playbackRate = clampedRate;
            }
            setPlaybackSpeed(clampedRate);
            sendResult(true);
          } else {
            sendResult(false, "Invalid rate parameter (0.25..2)");
          }
          break;
        }

        case "setProvider": {
          const lang = (cmdData.language || "sub").toLowerCase();
          const pId = (cmdData.providerId || "").toLowerCase();
          const langUpper = lang.toUpperCase();

          const found = sources.find((s) => {
            const typeOk = s.type.toUpperCase() === langUpper;
            const provOk = !pId || s.id?.toLowerCase().includes(pId) || s.serverName?.toLowerCase().includes(pId);
            return typeOk && provOk;
          }) || sources.find((s) => s.type.toUpperCase() === langUpper);

          if (found) {
            handleSelectSource(found);
          } else {
            setSelectedType(lang as "sub" | "dub");
            if (pId) setServer(pId);
          }
          sendResult(true);
          break;
        }

        case "getState":
        case "getStatus": {
          sendResult(true);
          postToParent("PLAYER_EVENT", {
            type: "status",
            ...getPlayerState(),
          });
          break;
        }
      }
    };

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [getPlayerState, handleSeek, handleSelectSource, sources, postToParent]);

  // What the header, the pause screen and Ajustes say about the current stream
  const serverName = currentSource ? getSourceProvider(currentSource) : server.charAt(0).toUpperCase() + server.slice(1);
  const subtitlesOn = Boolean(activeSubtitleTrack) && Boolean(currentSub);
  const audioLabel =
    selectedType === "dub"
      ? "Doblaje en inglés"
      : `Original · ${subtitlesOn && currentSub ? `Subtítulos en ${subtitleLabel(currentSub).toLowerCase()}` : "Sin subtítulos"}`;
  // Phones: the pause line has room for the language only
  const audioShort = selectedType === "dub" ? "Doblaje en inglés" : subtitlesOn && currentSub ? subtitleLabel(currentSub) : "Original";
  const episodeLine = `Episodio ${episodeNumber}${episodeTitle ? ` · ${episodeTitle}` : ""}`;

  // Tracks named by language; a name that still repeats gets numbered
  const seenNames = new Map<string, number>();
  const panelSubtitles = allAvailableSubtitles.map((track) => {
    const name = subtitleLabel(track);
    const count = (seenNames.get(name) || 0) + 1;
    seenNames.set(name, count);
    return { key: track.id || track.url, label: count > 1 ? `${name} ${count}` : name };
  });
  const activeSubtitleKey = subtitlesOn && currentSub ? currentSub.id || currentSub.url : null;

  const serverSources = selectedType === "dub" ? nativeDubSources : nativeSubSources;
  const activeId = activeSourceId || currentSource?.id;

  const framedNext = nextUp && !tv && wideScreen;
  const showPauseScreen = pauseScreen && panelView === null && !fatalError;
  // The loading screen has its own title: the bar and the header text wait for it to go
  const showBar = !fatalError && !nextUp && hasStarted;
  const controlsVisible = showControls || showPauseScreen;
  // Desktop keeps only play, time and Ajustes in the bar while the side panel is open
  const panelOpen = panelView !== null && !tv;

  const iconButton = (extra?: string) =>
    cn(
      "inline-flex items-center justify-center w-11 h-11 rounded-full text-white shrink-0 outline-none transition",
      "hover:bg-white/10 focus-visible:ring-2 focus-visible:ring-white active:scale-95",
      extra
    );
  const tvPill = (extra?: string) =>
    cn(
      "flex items-center gap-3 h-16 px-[1.625rem] rounded-full bg-ink-3/90 border-[1.5px] border-line text-zinc-200 text-[1.3125rem] font-bold outline-none transition",
      "focus:bg-white focus:text-black focus:border-white focus:koma",
      extra
    );

  const timeline = (
    <Timeline
      currentTime={currentTime}
      duration={duration}
      buffered={buffered}
      intro={skipTimes.intro}
      outro={skipTimes.outro}
      onSeek={handleSeek}
      onActivity={handleUserActivity}
      tv={tv}
      // TV shows the knob while playing; desktop while paused (and on hover)
      showKnob={tv ? !showPauseScreen : showPauseScreen}
      showLabels={!tv && !showPauseScreen}
      thin={showPauseScreen}
    />
  );

  return (
    <div
      ref={containerRef}
      onMouseMove={handleUserActivity}
      onClick={handleScreenClick}
      onTouchEnd={handleTouchEnd}
      onDoubleClick={handleDoubleClick}
      className={cn(
        "relative w-full h-full bg-black text-white overflow-hidden select-none touch-manipulation font-product-sans",
        !controlsVisible && !nextUp && !panelView ? "cursor-none [&_*]:!cursor-none" : "cursor-default",
        isFullscreen && "fixed inset-0 z-[99999] w-screen h-screen"
      )}
    >
      {/* Video: shrinks into a frame on the left while "up next" shows on wide screens */}
      <div
        className={cn(
          "absolute inset-0 origin-top-left transition-[transform,border-radius] duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] overflow-hidden",
          framedNext && "rounded-[36px]"
        )}
        style={framedNext ? { transform: "translate(5.5%, 18.5%) scale(0.486)" } : undefined}
      >
        <video
          ref={videoRef}
          onError={(e) => {
            console.warn("HTML5 video error:", e);
            setIsLoading(false);
            fallbackRef.current?.();
          }}
          onTimeUpdate={handleTimeUpdate}
          onLoadedMetadata={() => {
            if (videoRef.current) {
              const dur = videoRef.current.duration;
              setDuration(dur);
              if (rawSkipTimes.intro || rawSkipTimes.outro) {
                const isFlowSrv = server.toLowerCase().includes("flow") || server.toLowerCase().includes("kitty");
                const isFlowSource = rawSkipTimes.source?.includes("flow") || rawSkipTimes.source?.includes("reanime");
                if ((isFlowSource || isFlowSrv) && dur > 0) {
                  const adapted = adaptSkipTimes(rawSkipTimes.intro, rawSkipTimes.outro, rawSkipTimes.refDuration, dur);
                  setSkipTimes({ intro: adapted.intro, outro: adapted.outro });
                }
              }
            }
          }}
          onDurationChange={() => {
            if (videoRef.current && videoRef.current.duration > 0) {
              const dur = videoRef.current.duration;
              setDuration(dur);
              if (rawSkipTimes.intro || rawSkipTimes.outro) {
                const isFlowSrv = server.toLowerCase().includes("flow") || server.toLowerCase().includes("kitty");
                const isFlowSource = rawSkipTimes.source?.includes("flow") || rawSkipTimes.source?.includes("reanime");
                if ((isFlowSource || isFlowSrv) && dur > 0) {
                  const adapted = adaptSkipTimes(rawSkipTimes.intro, rawSkipTimes.outro, rawSkipTimes.refDuration, dur);
                  setSkipTimes({ intro: adapted.intro, outro: adapted.outro });
                }
              }
            }
          }}
          onCanPlay={() => {
            setIsLoading(false);
            // Ready, even if autoplay is blocked: the loading screen must not stay over the play button
            setHasStarted(true);
          }}
          onCanPlayThrough={() => setIsLoading(false)}
          onSeeked={() => setIsLoading(false)}
          onLoadedData={() => setIsLoading(false)}
          onWaiting={() => {
            if (videoRef.current && !videoRef.current.paused) {
              setIsLoading(true);
            }
          }}
          onPlaying={() => {
            setHasStarted(true);
            isSwitchingServerRef.current = false;
            setIsLoading(false);
            setIsPlaying(true);
            setEnded(false);
            if (audioCtxRef.current && audioCtxRef.current.state === "suspended") {
              audioCtxRef.current.resume().catch(() => {});
            }
          }}
          onPause={() => {
            if (isSwitchingServerRef.current) return;
            setIsLoading(false);
            setIsPlaying(false);
            const v = videoRef.current;
            const cur = v ? v.currentTime : currentTime;
            const dur = v ? v.duration : duration;
            postToParent("pause", {
              currentTime: Math.round(cur * 100) / 100,
              duration: Math.round((dur || 0) * 100) / 100,
              percentage: dur > 0 ? Math.round((cur / dur) * 1000) / 10 : 0,
              paused: true,
            });
          }}
          onEnded={() => {
            setIsPlaying(false);
            setEnded(true);
            const v = videoRef.current;
            const dur = v ? v.duration : duration;
            postToParent("ended", {
              currentTime: Math.round((dur || 0) * 100) / 100,
              duration: Math.round((dur || 0) * 100) / 100,
              percentage: 100,
              paused: true,
            });
            syncMalProgress();
            if (canPlayNext) showNextUp(5);
          }}
          playsInline
          crossOrigin="anonymous"
          className="w-full h-full object-contain"
        />
      </div>

      {/* Double-tap / arrow seek feedback */}
      {seekFeedback && (
        <div
          className={cn(
            "absolute inset-y-0 w-1/3 z-20 flex items-center justify-center pointer-events-none animate-in fade-in duration-150",
            seekFeedback.side === "left" ? "left-0 bg-gradient-to-r from-black/35 to-transparent" : "right-0 bg-gradient-to-l from-black/35 to-transparent"
          )}
        >
          <div className={cn("flex items-center gap-2 rounded-full bg-black/75 border-[1.5px] border-line font-bold", tv ? "px-7 py-4 text-3xl" : "px-4 py-2.5 text-sm")}>
            {seekFeedback.side === "left" ? <RotateCcw className={tv ? "w-8 h-8" : "w-5 h-5"} /> : <RotateCw className={tv ? "w-8 h-8" : "w-5 h-5"} />}
            {seekFeedback.side === "left" ? `-${seekFeedback.amount} s` : `+${seekFeedback.amount} s`}
          </div>
        </div>
      )}

      {/* Subtitles, lifted over the controls while they show */}
      {currentSubtitleText && !nextUp && !showPauseScreen && (
        <div
          className={cn(
            "absolute inset-x-4 z-20 flex justify-center text-center pointer-events-none transition-[bottom] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]",
            showControls && !fatalError
              ? tv
                ? "bottom-[22rem]"
                : "bottom-24 mouse:bottom-36 mouse:sm:bottom-44"
              : "bottom-[6%]"
          )}
        >
          <SubtitleText styles={subtitleStyles} playerHeight={playerHeight} className="max-w-[85%]">
            {currentSubtitleText}
          </SubtitleText>
        </div>
      )}

      <LoadingVeil
        visible={!hasStarted && !fatalError}
        poster={poster}
        title={animeTitle}
        episodeLine={episodeLine}
      />

      {/* Loading */}
      {isLoading && !fatalError && (
        <div className="absolute inset-0 z-20 flex items-center justify-center pointer-events-none">
          <div className={cn("flex items-center justify-center rounded-full bg-black/60", tv ? "w-24 h-24" : "w-16 h-16")}>
            <Loader2 className={cn("animate-spin", tv ? "w-12 h-12" : "w-8 h-8")} />
          </div>
        </div>
      )}

      {/* Phones: the whole frame dims a little while the controls show */}
      {!tv && (
        <div
          className={cn(
            "absolute inset-0 z-[25] hidden touch:block bg-black/45 pointer-events-none transition-opacity duration-300",
            showControls && showBar && !showPauseScreen ? "opacity-100" : "opacity-0"
          )}
        />
      )}

      {/* Gradients behind the header and the controls */}
      <div
        className={cn(
          "absolute inset-x-0 top-0 z-[25] bg-gradient-to-b from-black/85 to-transparent pointer-events-none transition-opacity duration-300",
          tv ? "h-56" : "h-32 sm:h-44",
          controlsVisible && !nextUp && !showPauseScreen ? "opacity-100" : "opacity-0"
        )}
      />
      <div
        className={cn(
          "absolute inset-x-0 bottom-0 z-[25] bg-gradient-to-t from-black/90 to-transparent pointer-events-none transition-opacity duration-300",
          tv ? "h-[26rem]" : "h-40 mouse:h-36 mouse:sm:h-[280px]",
          controlsVisible && showBar ? "opacity-100" : "opacity-0"
        )}
      />

      {/* Pause screen */}
      {showPauseScreen && (
        <PauseScreen
          tv={tv}
          title={animeTitle}
          episode={episodeNumber}
          episodeTitle={episodeTitle}
          synopsis={synopsis}
          remaining={Math.max(0, duration - currentTime)}
          speed={playbackSpeed}
          audioLabel={audioLabel}
          audioShort={audioShort}
          serverName={serverName}
          serverHealthy={!isLoading}
          next={nextEpisode}
          autoplayNext={autoplayNext}
          onContinue={togglePlay}
          onRestart={() => {
            handleSeek(0);
            if (videoRef.current?.paused) togglePlay();
          }}
          onEpisodes={onEpisodes}
          onNext={canPlayNext ? playNext : undefined}
          onSettings={tv ? () => openPanel() : undefined}
        />
      )}

      {/* Up next */}
      {nextUp && nextEpisode && (
        <NextEpisodeScreen
          tv={tv}
          framed={framedNext}
          title={animeTitle}
          episode={episodeNumber}
          next={nextEpisode}
          countdown={nextCountdown}
          countdownFrom={ended ? 5 : NEXT_COUNTDOWN}
          progress={duration > 0 ? currentTime / duration : 0}
          markedOn={markedOn}
          onPlayNow={playNext}
          onCancel={dismissNextUp}
          onWatchCredits={dismissNextUp}
        />
      )}

      {/* Header: back, title and the stream in use */}
      {!fatalError && (
        <header
          className={cn(
            "absolute z-40 flex transition-opacity duration-300",
            tv ? "items-start top-14 left-24 right-24 gap-6" : "items-center top-3 sm:top-6 left-3 sm:left-8 right-3 sm:right-8 gap-3 sm:gap-4",
            controlsVisible || nextUp ? "opacity-100" : "opacity-0 pointer-events-none"
          )}
        >
          {onBack && !tv && (
            <button
              type="button"
              onClick={onBack}
              aria-label="Volver a la ficha"
              className={iconButton(
                cn(
                  "border-[1.5px] border-line touch:bg-transparent touch:border-transparent",
                  showPauseScreen || nextUp ? "bg-ink-3 hover:bg-zinc-800" : "bg-black/60 hover:bg-black/80"
                )
              )}
            >
              <ChevronLeft className="w-[22px] h-[22px]" strokeWidth={2.4} />
            </button>
          )}
          {!showPauseScreen && (
            <div
              className={cn(
                "flex flex-col min-w-0 flex-1 transition-opacity duration-300",
                tv ? "gap-1.5" : "gap-0.5",
                !hasStarted && "opacity-0"
              )}
            >
              {nextUp ? (
                <span className={cn("font-medium text-zinc-200 truncate", tv ? "text-2xl" : "text-base")}>
                  {animeTitle} · Episodio {episodeNumber}
                </span>
              ) : (
                <>
                  <span className={cn("font-display truncate", tv ? "text-[1.875rem]" : "text-[15px] sm:text-xl")}>{animeTitle}</span>
                  <span className={cn("font-medium text-zinc-200 truncate", tv ? "text-[1.375rem]" : "text-xs sm:text-[15px]")}>{episodeLine}</span>
                </>
              )}
            </div>
          )}
          {!showPauseScreen && !nextUp && (
            <>
              <span
                className={cn(
                  "items-center gap-2 rounded-full border-[1.5px] border-line font-medium text-zinc-200 shrink-0",
                  tv ? "flex h-12 px-5 text-[1.1875rem] gap-2.5 bg-black/70" : "hidden mouse:md:flex h-[34px] px-3.5 text-[13px] bg-black/60"
                )}
              >
                <span className={cn("rounded-full", tv ? "w-2.5 h-2.5" : "w-2 h-2", isLoading ? "bg-amber-500" : "bg-green-400")} />
                {serverName} · {audioLabel}
              </span>
              {!tv && (
                <button
                  type="button"
                  onClick={() => openPanel()}
                  aria-label="Ajustes"
                  className={iconButton("hidden touch:inline-flex")}
                >
                  <Settings className="w-[22px] h-[22px]" />
                </button>
              )}
            </>
          )}
        </header>
      )}

      {/* Can't play: why, what happens next and what can be done */}
      {fatalError && !isLoading && (
        <PlayerErrorScreen
          kind={errorKind}
          tv={tv}
          poster={poster}
          animeTitle={animeTitle}
          episode={episodeNumber}
          detail={fatalError}
          airingAt={airingAt}
          nextCheckAt={nextCheckAt}
          checkEveryMs={checkEveryMs}
          checks={checks}
          resumeAt={preserveTimeRef.current}
          tried={triedServers}
          onRetry={retryPlayback}
          onChooseServer={() => {
            setFatalError(null);
            openPanel("main");
          }}
          onBack={onBack}
        />
      )}

      {/* Muted autoplay */}
      {isPlaying && isMuted && !tv && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            if (videoRef.current) {
              videoRef.current.muted = false;
              setIsMuted(false);
              try {
                localStorage.setItem("anime_player_muted", "false");
              } catch {}
            }
          }}
          className="absolute top-20 sm:top-24 left-1/2 -translate-x-1/2 z-40 flex items-center gap-2 h-9 px-4 rounded-full bg-black/80 hover:bg-black border-[1.5px] border-line text-sm font-medium animate-in fade-in slide-in-from-top-2"
        >
          <VolumeX className="w-4 h-4 text-amber-500" />
          Activar el sonido
        </button>
      )}

      {/* Toasts */}
      {(activeStreamToast || autoSkipToast) && !(isPlaying && isMuted && !tv) && (
        <div
          role="status"
          className={cn(
            "absolute left-1/2 -translate-x-1/2 z-40 max-w-[90%] pointer-events-none animate-in fade-in slide-in-from-top-2 duration-300",
            tv ? "top-40" : "top-20 sm:top-24"
          )}
        >
          <div
            className={cn(
              "flex items-center gap-2 rounded-full bg-zinc-900/95 border-[1.5px] border-line font-medium",
              tv ? "h-14 px-6 text-xl" : "h-9 px-4 text-sm"
            )}
          >
            {activeStreamToast?.type === "refreshing" && <Loader2 className="w-4 h-4 text-amber-500 animate-spin shrink-0" />}
            {activeStreamToast?.type === "success" && <Check className="w-4 h-4 text-green-400 shrink-0" />}
            {!activeStreamToast && <SkipForward className="w-4 h-4 text-amber-500 shrink-0" />}
            <span className="truncate">{activeStreamToast ? activeStreamToast.message : autoSkipToast}</span>
          </div>
        </div>
      )}

      {/* Skip intro / ending */}
      {showSkip && !fatalError && (
        <button
          ref={skipButtonRef}
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            if (isInsideIntro) handleSkipIntro();
            else handleSkipOutro();
          }}
          className={cn(
            "absolute z-40 flex items-center rounded-full bg-white text-black font-bold outline-none transition-[bottom,transform] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] animate-in zoom-in-90",
            tv
              ? cn(
                  "right-24 h-[4.5rem] px-8 gap-3.5 text-2xl font-black shadow-[6px_6px_0_rgb(var(--c-accent))] focus:koma",
                  showControls ? "bottom-[18.75rem]" : "bottom-24"
                )
              : cn(
                  "right-4 sm:right-10 h-10 sm:h-[46px] px-4 sm:px-5 gap-2.5 touch:gap-2 text-sm sm:text-[15px] hover:bg-zinc-200 focus-visible:ring-4 focus-visible:ring-white/40",
                  "shadow-[4px_4px_0_rgb(var(--c-accent))] touch:shadow-[3px_3px_0_rgb(var(--c-accent))]",
                  showControls ? "bottom-24 mouse:bottom-28 mouse:sm:bottom-[8.5rem]" : "bottom-6 sm:bottom-10"
                )
          )}
        >
          {isInsideIntro ? "Saltar intro" : "Saltar ending"}
          <SkipForward className={cn("fill-current", tv ? "w-7 h-7" : "w-[18px] h-[18px] touch:w-[15px] touch:h-[15px]")} />
        </button>
      )}

      {/* Touch: big play / pause and ±10 s in the middle */}
      {!tv && showBar && !showPauseScreen && !isLoading && (
        <div
          className={cn(
            "absolute inset-0 z-30 hidden touch:flex items-center justify-center gap-12 pb-12 pointer-events-none transition-opacity duration-200",
            showControls ? "opacity-100" : "opacity-0"
          )}
        >
          <button
            type="button"
            aria-label="Retroceder 10 segundos"
            onClick={(e) => {
              e.stopPropagation();
              handleSeekRelative(-10);
              handleUserActivity();
            }}
            className={cn("flex items-center justify-center w-14 h-14 rounded-full bg-black/60 border-[1.5px] border-line", showControls && "pointer-events-auto")}
          >
            <RotateCcw className="w-[26px] h-[26px]" />
          </button>
          <button
            type="button"
            aria-label={isPlaying ? "Pausar" : "Reproducir"}
            onClick={(e) => {
              e.stopPropagation();
              togglePlay();
              handleUserActivity();
            }}
            className={cn(
              "flex items-center justify-center w-[72px] h-[72px] rounded-full bg-white text-black shadow-[4px_4px_0_rgb(var(--c-accent))]",
              showControls && "pointer-events-auto"
            )}
          >
            {isPlaying ? <Pause className="w-[30px] h-[30px] fill-current" /> : <Play className="w-[30px] h-[30px] fill-current ml-1" />}
          </button>
          <button
            type="button"
            aria-label="Avanzar 10 segundos"
            onClick={(e) => {
              e.stopPropagation();
              handleSeekRelative(10);
              handleUserActivity();
            }}
            className={cn("flex items-center justify-center w-14 h-14 rounded-full bg-black/60 border-[1.5px] border-line", showControls && "pointer-events-auto")}
          >
            <RotateCw className="w-[26px] h-[26px]" />
          </button>
        </div>
      )}

      {/* Controls */}
      {showBar && (
        <div
          ref={controlsRef}
          data-controls-bar="true"
          onDoubleClick={(e) => e.stopPropagation()}
          className={cn(
            "absolute z-40 transition-[opacity,transform] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]",
            tv
              ? showPauseScreen
                ? "left-[7.5rem] right-[7.5rem] bottom-[9.375rem]"
                : "left-24 right-24 bottom-[4.5rem]"
              : "left-3 right-3 sm:left-7 sm:right-7 bottom-1 sm:bottom-5",
            panelView !== null && !tv && "sm:right-[428px]",
            controlsVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4 pointer-events-none"
          )}
        >
          {tv ? (
            <>
              {/* Playing: elapsed and remaining above the bar. Paused: elapsed and total under it */}
              {!showPauseScreen && (
                <div className="flex justify-between mb-3.5 font-display text-[1.375rem] leading-[1.1] tabular-nums">
                  <span>{formatSecondsToTime(currentTime)}</span>
                  <span className="text-zinc-400">-{formatSecondsToTime(Math.max(0, duration - currentTime))}</span>
                </div>
              )}
              {timeline}
              {showPauseScreen && (
                <div className="flex justify-between mt-3.5 font-display text-[1.375rem] leading-[1.1] tabular-nums">
                  <span>{formatSecondsToTime(currentTime)}</span>
                  <span className="text-zinc-400">{formatSecondsToTime(duration)}</span>
                </div>
              )}
              {!showPauseScreen && (
                <div className="flex items-center gap-4 mt-[4.25rem]">
                  <div data-nav="x" data-nav-exit="up" className="flex items-center gap-4">
                    <button type="button" onClick={togglePlay} className={tvPill()}>
                      {isPlaying ? "Pausa" : "Reproducir"}
                    </button>
                    {canPlayNext && (
                      <button type="button" onClick={playNext} className={tvPill()}>
                        Episodio {nextEpisode!.number}
                      </button>
                    )}
                    <button type="button" onClick={() => openPanel("subtitles")} className={tvPill()}>
                      Audio y subtítulos
                    </button>
                    {onEpisodes && (
                      <button type="button" onClick={onEpisodes} className={tvPill()}>
                        Episodios
                      </button>
                    )}
                    <button type="button" onClick={() => openPanel()} className={tvPill()}>
                      Más ajustes
                    </button>
                  </div>
                  <span className="flex-1" />
                  <RemoteHints
                    compact
                    hints={[
                      ["OK", showSkip ? (isInsideIntro ? "Saltar intro" : "Saltar ending") : isPlaying ? "Pausa" : "Reproducir"],
                      ["◀ ▶", "10 s"],
                      ["⟵", "Salir"],
                    ]}
                  />
                </div>
              )}
            </>
          ) : (
            <>
              {/* Phones: elapsed and total flank the bar on one row */}
              <div className="flex items-center gap-3 px-1 sm:px-3 touch:px-2">
                <span className="hidden touch:inline text-xs font-bold tabular-nums">{formatSecondsToTime(currentTime)}</span>
                <div className="flex-1 min-w-0">{timeline}</div>
                <span className="hidden touch:inline text-xs font-bold tabular-nums text-zinc-400">{formatSecondsToTime(duration)}</span>
              </div>
              <div className="flex items-center gap-1 mt-0.5">
                <button
                  type="button"
                  onClick={togglePlay}
                  aria-label={isPlaying ? "Pausar (espacio)" : "Reproducir (espacio)"}
                  title={isPlaying ? "Pausar (espacio)" : "Reproducir (espacio)"}
                  className={iconButton("w-12 h-12 touch:hidden")}
                >
                  {isPlaying ? <Pause className="w-[26px] h-[26px] fill-current" /> : <Play className="w-[26px] h-[26px] fill-current ml-0.5" />}
                </button>
                {!showPauseScreen && !panelOpen && (
                  <>
                    <button
                      type="button"
                      onClick={() => handleSeekRelative(-10)}
                      aria-label="Retroceder 10 segundos"
                      title="Retroceder 10 s (←)"
                      className={iconButton("hidden mouse:sm:inline-flex")}
                    >
                      <RotateCcw className="w-[22px] h-[22px]" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSeekRelative(10)}
                      aria-label="Avanzar 10 segundos"
                      title="Avanzar 10 s (→)"
                      className={iconButton("hidden mouse:sm:inline-flex")}
                    >
                      <RotateCw className="w-[22px] h-[22px]" />
                    </button>
                    <div className="hidden mouse:sm:flex items-center gap-2 ml-1">
                      <button
                        type="button"
                        onClick={toggleMute}
                        aria-label={isMuted || volume === 0 ? "Activar sonido (M)" : "Silenciar (M)"}
                        title={isMuted || volume === 0 ? "Activar sonido (M)" : "Silenciar (M)"}
                        className={iconButton()}
                      >
                        {isMuted || volume === 0 ? (
                          <VolumeX className="w-[22px] h-[22px] text-red-400" />
                        ) : volume < 0.5 ? (
                          <Volume1 className="w-[22px] h-[22px]" />
                        ) : (
                          <Volume2 className="w-[22px] h-[22px]" />
                        )}
                      </button>
                      <input
                        type="range"
                        min={0}
                        max={1}
                        step={0.05}
                        value={isMuted ? 0 : volume}
                        onChange={(e) => handleVolumeChange(Number(e.target.value))}
                        aria-label="Volumen"
                        style={{
                          background: `linear-gradient(to right, rgb(var(--c-paper)) ${(isMuted ? 0 : volume) * 100}%, rgba(var(--c-paper), 0.18) ${(isMuted ? 0 : volume) * 100}%)`,
                        }}
                        className="w-24 h-1 rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white [&::-moz-range-thumb]:w-3 [&::-moz-range-thumb]:h-3 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:bg-white [&::-moz-range-thumb]:border-0"
                      />
                    </div>
                  </>
                )}
                <button
                  type="button"
                  onClick={toggleTimeDisplay}
                  title={showRemainingTime ? "Ver el tiempo transcurrido" : "Ver el tiempo que queda"}
                  className={cn(
                    "touch:hidden ml-1 px-1.5 py-1 rounded-md text-[13px] sm:text-[15px] font-bold tabular-nums hover:bg-white/10",
                    showPauseScreen || panelOpen ? "mouse:sm:ml-1.5" : "mouse:sm:ml-[18px]"
                  )}
                >
                  {showRemainingTime ? `-${formatSecondsToTime(Math.max(0, duration - currentTime))}` : formatSecondsToTime(currentTime)}
                  <span className="text-zinc-400 font-medium"> / {formatSecondsToTime(duration)}</span>
                </button>
                <span className="flex-1" />
                {showPauseScreen ? (
                  <span className="hidden mouse:sm:flex items-center gap-2 pr-2 text-[13px] font-medium text-zinc-400">
                    <span className="px-2 py-px rounded-md border-[1.5px] border-b-[3px] border-zinc-500 font-black text-zinc-200">Espacio</span>
                    para continuar
                  </span>
                ) : panelOpen ? (
                  <button
                    type="button"
                    onClick={closePanel}
                    aria-label="Cerrar ajustes"
                    aria-pressed
                    title="Ajustes"
                    className={iconButton("bg-white text-black hover:bg-zinc-200 shadow-[3px_3px_0_rgb(var(--c-accent))]")}
                  >
                    <Settings className="w-[22px] h-[22px]" />
                  </button>
                ) : (
                  <>
                    {canPlayNext && (
                      <button
                        type="button"
                        onClick={playNext}
                        title="Siguiente episodio (N)"
                        className="flex items-center gap-1.5 sm:gap-2 h-9 sm:h-10 px-3 sm:px-3.5 mr-1 rounded-full bg-ink-3 border-[1.5px] border-line hover:bg-zinc-800 text-[13px] sm:text-sm font-bold outline-none focus-visible:ring-2 focus-visible:ring-white"
                      >
                        <SkipForward className="w-[15px] h-[15px] sm:w-[18px] sm:h-[18px] fill-current" />
                        Episodio {nextEpisode!.number}
                      </button>
                    )}
                    {onEpisodes && (
                      <button type="button" onClick={onEpisodes} aria-label="Episodios" title="Episodios" className={iconButton("touch:order-[-1]")}>
                        <ListVideo className="w-[22px] h-[22px]" />
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => (panelView === "subtitles" ? closePanel() : openPanel("subtitles"))}
                      aria-label="Subtítulos"
                      title="Subtítulos (C para activar o quitar)"
                      className={iconButton(cn("touch:order-[-2]", !subtitlesOn && "text-zinc-400"))}
                    >
                      <Captions className="w-[22px] h-[22px]" />
                    </button>
                    <button
                      type="button"
                      onClick={() => (panelView === null ? openPanel() : closePanel())}
                      aria-label="Ajustes"
                      aria-pressed={panelView !== null}
                      title="Ajustes"
                      className={iconButton(
                        cn("touch:hidden", panelView !== null && "bg-white text-black hover:bg-zinc-200 shadow-[3px_3px_0_rgb(var(--c-accent))]")
                      )}
                    >
                      <Settings className="w-[22px] h-[22px]" />
                    </button>
                    <button
                      type="button"
                      onClick={togglePiP}
                      aria-label="Imagen en imagen"
                      title="Imagen en imagen"
                      className={iconButton("hidden mouse:sm:inline-flex")}
                    >
                      <PictureInPicture2 className="w-[22px] h-[22px]" />
                    </button>
                    <button
                      type="button"
                      onClick={toggleFullscreen}
                      aria-label={isFullscreen ? "Salir de pantalla completa (F)" : "Pantalla completa (F)"}
                      title={isFullscreen ? "Salir de pantalla completa (F)" : "Pantalla completa (F)"}
                      className={iconButton()}
                    >
                      {isFullscreen ? <Minimize className="w-[22px] h-[22px]" /> : <Maximize className="w-[22px] h-[22px]" />}
                    </button>
                  </>
                )}
              </div>
            </>
          )}
        </div>
      )}

      {/* Ajustes */}
      {panelView !== null && (
        <SettingsPanel
          tv={tv}
          view={panelView}
          onViewChange={setPanelView}
          onClose={closePanel}
          audio={selectedType}
          hasDub={nativeDubSources.length > 0}
          onAudioChange={(audio) => {
            if (audio === selectedType) return;
            const list = audio === "dub" ? nativeDubSources : nativeSubSources;
            const target = list.find((s) => getSourceProvider(s).toLowerCase() === server) || list[0];
            if (target) handleSelectSource(target);
          }}
          subtitles={panelSubtitles}
          activeSubtitle={activeSubtitleKey}
          onSubtitleChange={(key) => setActiveSubtitleTrack(key)}
          subtitleStyles={subtitleStyles}
          onSubtitleStylesChange={(updated) => {
            setSubtitleStyles(updated);
            try {
              updatePlaybackPreferences({ subtitleStyles: updated });
            } catch {}
          }}
          qualities={hlsLevels}
          quality={selectedHlsLevel}
          onQualityChange={handleSelectQuality}
          speed={playbackSpeed}
          onSpeedChange={(speed) => {
            if (videoRef.current) videoRef.current.playbackRate = speed;
            setPlaybackSpeed(speed);
          }}
          boost={volumeBoost}
          onBoostChange={handleVolumeBoost}
          autoSkipIntro={autoSkipState}
          onAutoSkipIntroChange={(on) => {
            setAutoSkipState(on);
            updatePlaybackPreferences({ autoSkipIntro: on });
          }}
          autoSkipOutro={autoSkipOutroState}
          onAutoSkipOutroChange={(on) => {
            setAutoSkipOutroState(on);
            updatePlaybackPreferences({ autoSkipOutro: on });
          }}
          autoplayNext={canPlayNext ? autoplayNext : undefined}
          onAutoplayNextChange={
            canPlayNext
              ? (on) => {
                  setAutoplayNext(on);
                  updatePlaybackPreferences({ autoplayNext: on });
                }
              : undefined
          }
          servers={serverSources.map((src) => {
            const name = getSourceProvider(src);
            const active = activeId === src.id;
            return { id: name.toLowerCase(), name, active, onSelect: () => !active && handleSelectSource(src) };
          })}
        />
      )}
    </div>
  );
}
