"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { pause as pauseNavigation, resume as resumeNavigation } from "@noriginmedia/norigin-spatial-navigation";
import { ChevronLeft, Maximize, Minimize, Pause, Play, SkipBack, SkipForward, Volume1, Volume2, VolumeX } from "lucide-react";
import type { AnimeTheme } from "@/lib/library/themes";
import { themeArtists, themeLabel } from "@/lib/library/themes";
import { getMediaAction, isBackKey } from "@/lib/tv/keys";
import { useBackHandler } from "@/components/tv/navigation-provider";
import { useIsTv } from "@/components/ui-mode";
import { Timeline } from "@/components/player/ui/timeline";
import { RemoteHints } from "@/components/player/ui/remote-hints";
import { cn, formatSecondsToTime } from "@/lib/utils";

export interface ThemeTrack {
  theme: AnimeTheme;
  /** The anime's title, shown over the song */
  animeTitle: string;
  /** For lists of songs (the radio's library) */
  animeId?: number;
  cover?: string | null;
}

const HIDE_MS = 3500;
const SKIP_AFTER_ERROR_MS = 2500;
const SEEK_STEP = 5;
// The episode player's volume, so both sound the same
const VOLUME_KEY = "anime_player_volume";

const iconButton = (extra?: string) =>
  cn(
    "inline-flex items-center justify-center w-11 h-11 rounded-full text-white shrink-0 outline-none transition",
    "hover:bg-white/10 focus-visible:ring-2 focus-visible:ring-white active:scale-95",
    extra
  );

/**
 * Full-screen player for openings and endings, one after another: the anime page's own themes, or
 * the radio's list (`loop` starts over at the end). Laid out like the episode player: the anime and
 * song on top and bottom, the same seek bar, and controls that fade while it plays.
 * Web: buttons, Space pauses, ← → move 5 s, N / P change song, M mutes, F fullscreen, Escape
 * closes. TV: OK pauses, ◀ ▶ change song, Back closes.
 */
export function ThemePlayer({
  tracks,
  startIndex = 0,
  loop = false,
  label,
  onClose,
}: {
  tracks: ThemeTrack[];
  startIndex?: number;
  loop?: boolean;
  /** Shown above the anime, e.g. "Radio de openings" */
  label?: string;
  onClose: () => void;
}) {
  const isTv = useIsTv();
  const rootRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [index, setIndex] = useState(startIndex);
  const [paused, setPaused] = useState(false);
  const [failed, setFailed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [buffered, setBuffered] = useState(0);
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [active, setActive] = useState(true);
  const hideTimer = useRef<ReturnType<typeof setTimeout>>();
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  const track = tracks[index];
  const nextTrack = tracks[index + 1] ?? (loop ? tracks[0] : undefined);

  const reveal = useCallback(() => {
    setActive(true);
    clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => setActive(false), HIDE_MS);
  }, []);

  const indexRef = useRef(index);
  indexRef.current = index;
  /** Moves `by` songs; past the end it starts over (radio) or closes */
  const go = useCallback(
    (by: number) => {
      const next = indexRef.current + by;
      if (next >= tracks.length) {
        if (loop) setIndex(0);
        else onCloseRef.current();
      } else if (next < 0) setIndex(loop ? tracks.length - 1 : 0);
      else setIndex(next);
    },
    [loop, tracks.length]
  );

  const toggle = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) video.play().catch(() => {});
    else video.pause();
  }, []);

  const seekTo = useCallback((seconds: number) => {
    const video = videoRef.current;
    if (!video || !Number.isFinite(video.duration)) return;
    video.currentTime = Math.min(Math.max(0, seconds), video.duration - 0.1);
    setTime(video.currentTime);
  }, []);

  const changeVolume = useCallback((value: number) => {
    setVolume(value);
    setMuted(value === 0);
    try {
      localStorage.setItem(VOLUME_KEY, String(value));
    } catch {}
  }, []);

  const toggleFullscreen = useCallback(() => {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    else rootRef.current?.requestFullscreen?.().catch(() => {});
  }, []);

  useEffect(() => {
    try {
      const saved = parseFloat(localStorage.getItem(VOLUME_KEY) || "");
      if (!Number.isNaN(saved)) setVolume(Math.min(1, Math.max(0, saved)));
    } catch {}
    const onChange = () => setFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", onChange);
    return () => {
      document.removeEventListener("fullscreenchange", onChange);
      if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    };
  }, []);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.volume = volume;
    video.muted = muted;
  }, [volume, muted, index]);

  // A new song: show the controls, start from zero
  useEffect(() => {
    setFailed(false);
    setLoading(true);
    setTime(0);
    setDuration(0);
    setBuffered(0);
    reveal();
  }, [index, reveal]);

  // A video this browser can't play is skipped after a moment
  useEffect(() => {
    if (!failed) return;
    const timer = setTimeout(() => go(1), SKIP_AFTER_ERROR_MS);
    return () => clearTimeout(timer);
  }, [failed, go]);

  useBackHandler(() => {
    onCloseRef.current();
    return true;
  });

  // The page underneath must not react to the remote while this is up
  useEffect(() => {
    if (!isTv) return;
    (document.activeElement as HTMLElement | null)?.blur();
    pauseNavigation();
    return () => resumeNavigation();
  }, [isTv]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const media = getMediaAction(e);
      const key = e.key.toLowerCase();
      const left = e.key === "ArrowLeft" || e.keyCode === 37;
      const right = e.key === "ArrowRight" || e.keyCode === 39;
      let handled = true;
      if (media === "stop" || (!isTv && isBackKey(e) && e.key === "Escape")) onCloseRef.current();
      else if (media === "forward" || (isTv && right) || (!isTv && key === "n")) go(1);
      else if (media === "rewind" || (isTv && left) || (!isTv && key === "p")) go(-1);
      else if (!isTv && (left || right)) seekTo((videoRef.current?.currentTime ?? 0) + (right ? SEEK_STEP : -SEEK_STEP));
      else if (!isTv && key === "m") setMuted((m) => !m);
      else if (!isTv && key === "f") toggleFullscreen();
      else if (media || e.key === "Enter" || e.keyCode === 13 || (!isTv && e.key === " ")) {
        // A focused button already answers Enter and Space by itself
        if (!isTv && (e.target as HTMLElement | null)?.closest("button")) return reveal();
        toggle();
      } else if (e.key === "ArrowUp" || e.key === "ArrowDown" || e.keyCode === 38 || e.keyCode === 40) reveal();
      else handled = false;
      if (handled) {
        e.preventDefault();
        reveal();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [go, isTv, reveal, seekTo, toggle, toggleFullscreen]);

  useEffect(() => () => clearTimeout(hideTimer.current), []);

  if (!track) return null;
  const { theme, animeTitle } = track;
  const visible = active || paused || failed;
  const silent = muted || volume === 0;
  const counter = tracks.length > 1 ? `${index + 1} de ${tracks.length}` : null;
  const upNext = nextTrack && nextTrack !== track ? `${themeLabel(nextTrack.theme)} · ${nextTrack.animeTitle}` : null;

  const timeline = (
    <Timeline
      currentTime={time}
      duration={duration}
      buffered={buffered}
      intro={null}
      outro={null}
      onSeek={seekTo}
      onActivity={reveal}
      tv={isTv}
      showKnob={isTv || paused}
      label="Progreso de la canción"
    />
  );

  // On <body>: inside a page that animates in, a transformed ancestor would box "fixed" in
  return createPortal(
    <div
      ref={rootRef}
      className={cn(
        "fixed top-0 left-0 z-[70] w-screen h-screen bg-black text-white overflow-hidden select-none font-product-sans",
        !visible && "cursor-none"
      )}
      onMouseMove={isTv ? undefined : reveal}
      role="dialog"
      aria-label={`${themeLabel(theme)} de ${animeTitle}`}
    >
      <video
        key={theme.video}
        ref={videoRef}
        src={theme.video}
        autoPlay
        playsInline
        preload="auto"
        className="w-full h-full object-contain"
        onPlay={() => setPaused(false)}
        onPause={() => setPaused(true)}
        onPlaying={() => setLoading(false)}
        onWaiting={() => setLoading(true)}
        onLoadedMetadata={(e) => setDuration(e.currentTarget.duration || 0)}
        onDurationChange={(e) => setDuration(e.currentTarget.duration || 0)}
        onTimeUpdate={(e) => setTime(e.currentTarget.currentTime)}
        onProgress={(e) => {
          const ranges = e.currentTarget.buffered;
          if (ranges.length) setBuffered(ranges.end(ranges.length - 1));
        }}
        onEnded={() => go(1)}
        onError={() => setFailed(true)}
        onClick={isTv ? undefined : toggle}
        onDoubleClick={isTv ? undefined : toggleFullscreen}
      />

      {loading && !failed && !paused && (
        <span
          aria-hidden
          className={cn(
            "absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full border-white/20 border-t-red-500 animate-spin",
            isTv ? "w-16 h-16 border-[5px]" : "w-12 h-12 border-4"
          )}
        />
      )}

      {/* Shade behind the controls */}
      <div
        aria-hidden
        className={cn(
          "absolute top-0 left-0 w-full h-full pointer-events-none transition-opacity duration-300",
          "bg-[linear-gradient(to_bottom,rgba(0,0,0,0.75),transparent_28%,transparent_52%,rgba(0,0,0,0.9))]",
          visible ? "opacity-100" : "opacity-0"
        )}
      />

      {/* Header: back, the list and the anime */}
      <header
        className={cn(
          "absolute z-10 flex transition-opacity duration-300",
          isTv ? "items-start top-14 left-24 right-24" : "items-center top-3 sm:top-6 left-3 sm:left-8 right-3 sm:right-8",
          visible ? "opacity-100" : "opacity-0 pointer-events-none"
        )}
      >
        {!isTv && (
          <button
            type="button"
            onClick={() => onCloseRef.current()}
            aria-label="Cerrar (Esc)"
            title="Cerrar (Esc)"
            className={iconButton("mr-3 sm:mr-4 border-[1.5px] border-line bg-black/60 hover:bg-black/80")}
          >
            <ChevronLeft className="w-[22px] h-[22px]" strokeWidth={2.4} />
          </button>
        )}
        <div className="flex flex-col min-w-0 flex-1">
          {label && (
            <span className={cn("font-bold uppercase tracking-[0.14em] text-red-500", isTv ? "text-lg" : "text-[11px] sm:text-xs")}>
              {label}
            </span>
          )}
          <span className={cn("font-display truncate", isTv ? "mt-1.5 text-[1.875rem]" : "mt-0.5 text-[15px] sm:text-xl")}>{animeTitle}</span>
        </div>
        {counter && (
          <span
            className={cn(
              "shrink-0 ml-4 rounded-full border-[1.5px] border-line font-bold tabular-nums text-zinc-200 bg-black/60",
              isTv ? "flex items-center h-12 px-5 text-[1.1875rem]" : "hidden sm:flex items-center h-[34px] px-3.5 text-[13px]"
            )}
          >
            {counter}
          </span>
        )}
      </header>

      {/* Bottom: the song, the bar and the controls */}
      <div
        className={cn(
          "absolute z-10 transition-[opacity,transform] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]",
          isTv ? "left-24 right-24 bottom-[4.5rem]" : "left-3 right-3 sm:left-7 sm:right-7 bottom-1 sm:bottom-5",
          visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4 pointer-events-none"
        )}
      >
        <div className={cn("flex items-end", isTv ? "mb-8" : "mb-3 px-1 sm:px-3")}>
          <div className="min-w-0 flex-1">
            <div className="flex items-center">
              <span
                className={cn(
                  "shrink-0 rounded-md bg-white text-black font-black",
                  isTv ? "px-2.5 py-0.5 text-lg mr-4" : "px-2 py-0.5 text-xs sm:text-sm mr-3"
                )}
              >
                {themeLabel(theme)}
              </span>
              {theme.episodes && (
                <span className={cn("text-zinc-400 truncate", isTv ? "text-xl" : "text-xs sm:text-sm")}>Ep. {theme.episodes}</span>
              )}
            </div>
            <p className={cn("font-display line-clamp-1", isTv ? "mt-3 text-5xl leading-tight" : "mt-2 text-2xl md:text-4xl leading-tight")}>
              {theme.title || "Sin título"}
            </p>
            {theme.artists.length > 0 && (
              <p className={cn("text-zinc-300 line-clamp-1", isTv ? "mt-2 text-2xl" : "mt-1 text-sm sm:text-base")}>{themeArtists(theme)}</p>
            )}
            {failed && (
              <p className={cn("text-amber-400", isTv ? "mt-3 text-xl" : "mt-2 text-sm")}>
                Este navegador no puede reproducir este vídeo. Pasando al siguiente…
              </p>
            )}
          </div>
          {upNext && (
            <p className={cn("shrink-0 ml-6 text-right text-zinc-400 truncate", isTv ? "max-w-[30rem] text-xl" : "hidden md:block max-w-[22rem] text-sm")}>
              <span className="text-zinc-500">Siguiente</span>
              <br />
              <span className="text-zinc-200">{upNext}</span>
            </p>
          )}
        </div>

        {isTv ? (
          <>
            <div className="flex justify-between mb-3.5 font-display text-[1.375rem] leading-[1.1] tabular-nums">
              <span>{formatSecondsToTime(time)}</span>
              <span className="text-zinc-400">-{formatSecondsToTime(Math.max(0, duration - time))}</span>
            </div>
            {timeline}
            <div className="flex mt-10">
              <span className="flex-1" />
              <RemoteHints
                compact
                hints={[
                  ["OK", paused ? "Reproducir" : "Pausa"],
                  ...(tracks.length > 1 ? ([["◀ ▶", "Canción"]] as [string, string][]) : []),
                  ["⟵", "Salir"],
                ]}
              />
            </div>
          </>
        ) : (
          <>
            {/* Phones: elapsed and total flank the bar */}
            <div className="flex items-center gap-3 px-1 sm:px-3 touch:px-2">
              <span className="hidden touch:inline text-xs font-bold tabular-nums">{formatSecondsToTime(time)}</span>
              <div className="flex-1 min-w-0">{timeline}</div>
              <span className="hidden touch:inline text-xs font-bold tabular-nums text-zinc-400">{formatSecondsToTime(duration)}</span>
            </div>
            <div className="flex items-center gap-1 mt-0.5">
              {tracks.length > 1 && (
                <button type="button" onClick={() => go(-1)} aria-label="Canción anterior (P)" title="Canción anterior (P)" className={iconButton()}>
                  <SkipBack className="w-[22px] h-[22px] fill-current" />
                </button>
              )}
              <button
                type="button"
                onClick={toggle}
                aria-label={paused ? "Reproducir (espacio)" : "Pausar (espacio)"}
                title={paused ? "Reproducir (espacio)" : "Pausar (espacio)"}
                className={iconButton("w-12 h-12")}
              >
                {paused ? <Play className="w-[26px] h-[26px] fill-current ml-0.5" /> : <Pause className="w-[26px] h-[26px] fill-current" />}
              </button>
              {tracks.length > 1 && (
                <button type="button" onClick={() => go(1)} aria-label="Canción siguiente (N)" title="Canción siguiente (N)" className={iconButton()}>
                  <SkipForward className="w-[22px] h-[22px] fill-current" />
                </button>
              )}
              <div className="hidden mouse:sm:flex items-center gap-2 ml-1">
                <button
                  type="button"
                  onClick={() => setMuted((m) => !m)}
                  aria-label={silent ? "Activar sonido (M)" : "Silenciar (M)"}
                  title={silent ? "Activar sonido (M)" : "Silenciar (M)"}
                  className={iconButton()}
                >
                  {silent ? (
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
                  value={muted ? 0 : volume}
                  onChange={(e) => changeVolume(Number(e.target.value))}
                  aria-label="Volumen"
                  style={{
                    background: `linear-gradient(to right, rgb(var(--c-paper)) ${(muted ? 0 : volume) * 100}%, rgba(var(--c-paper), 0.18) ${(muted ? 0 : volume) * 100}%)`,
                  }}
                  className="w-24 h-1 rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white [&::-moz-range-thumb]:w-3 [&::-moz-range-thumb]:h-3 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:bg-white [&::-moz-range-thumb]:border-0"
                />
              </div>
              <span className="touch:hidden ml-1 mouse:sm:ml-[18px] px-1.5 text-[13px] sm:text-[15px] font-bold tabular-nums">
                {formatSecondsToTime(time)}
                <span className="text-zinc-400 font-medium"> / {formatSecondsToTime(duration)}</span>
              </span>
              <span className="flex-1" />
              <button
                type="button"
                onClick={toggleFullscreen}
                aria-label={fullscreen ? "Salir de pantalla completa (F)" : "Pantalla completa (F)"}
                title={fullscreen ? "Salir de pantalla completa (F)" : "Pantalla completa (F)"}
                className={iconButton()}
              >
                {fullscreen ? <Minimize className="w-[22px] h-[22px]" /> : <Maximize className="w-[22px] h-[22px]" />}
              </button>
            </div>
          </>
        )}
      </div>
    </div>,
    document.body
  );
}
