"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { pause as pauseNavigation, resume as resumeNavigation } from "@noriginmedia/norigin-spatial-navigation";
import { ChevronLeft, ChevronRight, Pause, Play, X } from "lucide-react";
import type { AnimeTheme } from "@/lib/library/themes";
import { themeArtists, themeLabel } from "@/lib/library/themes";
import { getMediaAction, isBackKey } from "@/lib/tv/keys";
import { useBackHandler } from "@/components/tv/navigation-provider";
import { useIsTv } from "@/components/ui-mode";
import { cn } from "@/lib/utils";

export interface ThemeTrack {
  theme: AnimeTheme;
  /** The anime's title, shown under the song */
  animeTitle: string;
}

const INFO_MS = 4500;
const SKIP_AFTER_ERROR_MS = 2500;

/**
 * Full-screen player for openings and endings, one after another: the anime page's own themes, or
 * the radio's shuffled list (`loop` starts over at the end). On TV the remote's arrows change the
 * song, OK pauses and Back closes; on the web there are buttons, and Escape closes.
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
  /** Shown above the song, e.g. "Radio de openings" */
  label?: string;
  onClose: () => void;
}) {
  const isTv = useIsTv();
  const videoRef = useRef<HTMLVideoElement>(null);
  const [index, setIndex] = useState(startIndex);
  const [paused, setPaused] = useState(false);
  const [failed, setFailed] = useState(false);
  const [showInfo, setShowInfo] = useState(true);
  const infoTimer = useRef<ReturnType<typeof setTimeout>>();
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  const track = tracks[index];
  const nextTrack = tracks[index + 1] ?? (loop ? tracks[0] : undefined);

  const reveal = useCallback(() => {
    setShowInfo(true);
    clearTimeout(infoTimer.current);
    infoTimer.current = setTimeout(() => setShowInfo(false), INFO_MS);
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

  // A new song: show its info, and start it
  useEffect(() => {
    setFailed(false);
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
      let handled = true;
      if (media === "stop" || (!isTv && isBackKey(e) && e.key === "Escape")) onCloseRef.current();
      else if (media === "forward" || e.key === "ArrowRight" || e.keyCode === 39) go(1);
      else if (media === "rewind" || e.key === "ArrowLeft" || e.keyCode === 37) go(-1);
      else if (media || e.key === "Enter" || e.keyCode === 13 || (!isTv && e.key === " ")) toggle();
      else if (e.key === "ArrowUp" || e.key === "ArrowDown" || e.keyCode === 38 || e.keyCode === 40) reveal();
      else handled = false;
      if (handled) {
        e.preventDefault();
        reveal();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [go, isTv, reveal, toggle]);

  useEffect(() => () => clearTimeout(infoTimer.current), []);

  if (!track) return null;
  const { theme, animeTitle } = track;
  const visible = showInfo || paused || failed;

  return (
    <div
      className="fixed top-0 left-0 z-[70] w-screen h-screen bg-black text-white"
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
        onEnded={() => go(1)}
        onError={() => setFailed(true)}
        onClick={isTv ? undefined : toggle}
      />

      <div
        className={cn(
          "absolute left-0 right-0 bottom-0 flex items-end justify-between px-[5vw] pt-28 pb-[6vh] bg-gradient-to-t from-black/90 to-transparent transition-opacity duration-300 pointer-events-none",
          visible ? "opacity-100" : "opacity-0"
        )}
      >
        <div className="min-w-0 mr-8">
          {label && <p className="text-sm font-bold uppercase tracking-widest text-red-500 tv:text-lg">{label}</p>}
          <p className="mt-1 flex items-center text-lg text-zinc-300 tv:text-2xl">
            <span className="mr-3 px-2 py-0.5 rounded-md bg-white text-black text-sm font-black tv:text-lg">{themeLabel(theme)}</span>
            <span className="truncate">{animeTitle}</span>
          </p>
          <p className="mt-2 text-2xl font-black line-clamp-1 md:text-4xl tv:text-5xl">{theme.title || "Sin título"}</p>
          {theme.artists.length > 0 && <p className="mt-1 text-base text-zinc-300 tv:text-2xl">{themeArtists(theme)}</p>}
          {failed && <p className="mt-3 text-base text-amber-300 tv:text-xl">Este navegador no puede reproducir este vídeo. Pasando al siguiente…</p>}
        </div>
        <div className="flex-shrink-0 text-right text-sm text-zinc-400 tv:text-xl">
          {tracks.length > 1 && (
            <p>
              {index + 1} de {tracks.length}
            </p>
          )}
          {nextTrack && nextTrack !== track && (
            <p className="mt-1 max-w-[22rem] truncate">
              Siguiente: {themeLabel(nextTrack.theme)} · {nextTrack.animeTitle}
            </p>
          )}
          {isTv && <p className="mt-3 text-zinc-500">◀ ▶ cambiar · OK pausa · ⟵ salir</p>}
        </div>
      </div>

      {!isTv && (
        <div
          className={cn(
            "absolute top-4 right-4 flex items-center gap-2 transition-opacity duration-300",
            visible ? "opacity-100" : "opacity-0"
          )}
        >
          {tracks.length > 1 && (
            <button type="button" onClick={() => go(-1)} aria-label="Anterior" className="w-11 h-11 flex items-center justify-center rounded-full bg-black/70 hover:bg-black">
              <ChevronLeft className="w-6 h-6" />
            </button>
          )}
          <button type="button" onClick={toggle} aria-label={paused ? "Reproducir" : "Pausar"} className="w-11 h-11 flex items-center justify-center rounded-full bg-black/70 hover:bg-black">
            {paused ? <Play className="w-5 h-5 ml-0.5" fill="currentColor" /> : <Pause className="w-5 h-5" fill="currentColor" />}
          </button>
          {tracks.length > 1 && (
            <button type="button" onClick={() => go(1)} aria-label="Siguiente" className="w-11 h-11 flex items-center justify-center rounded-full bg-black/70 hover:bg-black">
              <ChevronRight className="w-6 h-6" />
            </button>
          )}
          <button type="button" onClick={() => onCloseRef.current()} aria-label="Cerrar" className="w-11 h-11 flex items-center justify-center rounded-full bg-black/70 hover:bg-black">
            <X className="w-6 h-6" />
          </button>
        </div>
      )}
    </div>
  );
}
