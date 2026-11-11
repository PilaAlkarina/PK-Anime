"use client";

import { useEffect, useRef, useState } from "react";
import { pause, resume } from "@noriginmedia/norigin-spatial-navigation";
import { getMediaAction } from "@/lib/tv/keys";
import { useBackHandler } from "./navigation-provider";
import { cn } from "@/lib/utils";
import { RemoteKeys } from "@/components/icons";

const HINT_MS = 4000;

/**
 * Full-screen trailer for the remote. Focus never enters the embedded player (it would keep
 * the remote's keys, Back included); the page sends it play/pause instead.
 */
export function TrailerOverlay({ src, title, onClose }: { src: string; title: string; onClose: () => void }) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const pausedRef = useRef(false);
  const [paused, setPaused] = useState(false);
  const [hint, setHint] = useState(true);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useBackHandler(() => {
    onCloseRef.current();
    return true;
  });

  // The page underneath must not react to the arrows while the trailer is up
  useEffect(() => {
    (document.activeElement as HTMLElement | null)?.blur();
    pause();
    return () => resume();
  }, []);

  useEffect(() => {
    if (!hint) return;
    const timer = setTimeout(() => setHint(false), HINT_MS);
    return () => clearTimeout(timer);
  }, [hint, paused]);

  useEffect(() => {
    const send = (play: boolean) => {
      const player = iframeRef.current?.contentWindow;
      if (!player) return;
      if (src.includes("dailymotion.com")) player.postMessage(play ? "play" : "pause", "*");
      else player.postMessage(JSON.stringify({ event: "command", func: play ? "playVideo" : "pauseVideo", args: [] }), "*");
    };

    const onKeyDown = (e: KeyboardEvent) => {
      const media = getMediaAction(e);
      const enter = e.key === "Enter" || e.keyCode === 13;
      if (!media && !enter) return;
      e.preventDefault();
      const action = media ?? "toggle";
      if (action === "stop") return onCloseRef.current();
      if (action === "forward" || action === "rewind") return;
      const next = action === "toggle" ? !pausedRef.current : action === "pause";
      pausedRef.current = next;
      setPaused(next);
      setHint(true);
      send(!next);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [src]);

  return (
    // Pure black beside the video, not the theme's ink that `bg-black` maps to
    <div className="fixed top-0 left-0 z-[70] w-screen h-screen bg-[#000]">
      <iframe
        ref={iframeRef}
        src={src}
        title={`Tráiler de ${title}`}
        tabIndex={-1}
        allow="autoplay; encrypted-media; fullscreen"
        // YouTube refuses to play (error 153) when the embed sends no Referer
        referrerPolicy="strict-origin-when-cross-origin"
        className="w-full h-full border-0 pointer-events-none"
      />
      <div
        className={cn(
          "absolute left-0 right-0 bottom-0 flex items-end justify-between px-[5vw] pt-24 pb-[6vh] bg-gradient-to-t from-black/90 to-transparent transition-opacity duration-300",
          hint || paused ? "opacity-100" : "opacity-0"
        )}
      >
        <div>
          <p className="text-lg text-zinc-400">Tráiler</p>
          <p className="mt-1 text-3xl font-bold line-clamp-1">{title}</p>
        </div>
        <div className="flex items-center text-xl text-zinc-200">
          <span className="mr-2 px-2.5 rounded-lg border-2 border-zinc-500 font-bold leading-relaxed">OK</span>
          {paused ? "Reanudar" : "Pausar"}
          <span className="ml-8 mr-2 px-2.5 rounded-lg border-2 border-zinc-500 font-bold leading-relaxed"><RemoteKeys keys={["back"]} /></span>
          Volver a la ficha
        </div>
      </div>
    </div>
  );
}
