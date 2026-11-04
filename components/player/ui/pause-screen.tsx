"use client";

import { Stamp } from "@/components/brand";
import { useEffect, useRef, useState } from "react";
import { ListVideo, Play, RotateCcw } from "lucide-react";
import { cn, formatSecondsToTime } from "@/lib/utils";
import { focusFirst } from "./focus-nav";
import { RemoteHints } from "./remote-hints";
import type { NextEpisodeInfo } from "./types";

interface PauseScreenProps {
  tv: boolean;
  title: string;
  episode: number;
  episodeTitle?: string | null;
  synopsis?: string | null;
  /** Seconds left at normal speed */
  remaining: number;
  speed: number;
  audioLabel: string;
  serverName: string;
  serverHealthy: boolean;
  next?: NextEpisodeInfo | null;
  autoplayNext: boolean;
  onContinue: () => void;
  onRestart: () => void;
  onEpisodes?: () => void;
  onNext?: () => void;
  /** TV only: the remote has no control bar to reach Ajustes from */
  onSettings?: () => void;
}

/** Shown a moment after pausing: where you are, what's left and what comes next */
export function PauseScreen(props: PauseScreenProps) {
  const { tv } = props;
  const actionsRef = useRef<HTMLDivElement | null>(null);
  // "Terminas a las…" follows the clock while the video stays paused
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (tv) focusFirst(actionsRef.current);
  }, [tv]);

  const left = props.remaining / (props.speed || 1);
  const endsAt = new Date(now + left * 1000).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });
  const episodeLine = `Episodio ${props.episode}${props.episodeTitle ? ` · ${props.episodeTitle}` : ""}`;

  const chip = cn("inline-flex items-center gap-1.5 rounded-full bg-white/10 text-zinc-200", tv ? "px-4 py-1.5 text-xl" : "px-2.5 py-1 text-xs tall:sm:px-3 tall:sm:py-1.5 tall:sm:text-sm");
  const primary = cn(
    "flex items-center gap-2.5 rounded-full bg-red-500 text-black font-bold outline-none transition",
    tv ? "h-[4.75rem] px-10 text-[1.625rem] focus:bg-white focus:shadow-hard-accent focus:-translate-x-1 focus:-translate-y-1" : "h-11 px-5 text-[15px] tall:sm:h-[52px] tall:sm:px-6 tall:sm:text-base hover:bg-red-400 tall:sm:shadow-hard"
  );
  const secondary = cn(
    "flex items-center gap-2.5 rounded-full font-semibold outline-none transition",
    tv
      ? "h-[4.75rem] px-7 text-2xl bg-white/[0.12] text-zinc-200 focus:bg-white focus:text-black focus:shadow-hard-accent focus:-translate-x-1 focus:-translate-y-1"
      : "h-11 px-4 text-sm tall:sm:h-[52px] tall:sm:px-5 tall:sm:text-base bg-white/[0.14] hover:bg-white/25"
  );

  return (
    <div className="absolute inset-0 z-30 animate-in fade-in duration-300 pointer-events-none">
      <div className="absolute inset-0 bg-gradient-to-r from-black/95 via-black/80 to-black/30" />
      <div aria-hidden="true" className="absolute inset-y-0 left-[30%] w-[50%] screentone [mask-image:linear-gradient(90deg,transparent,#000_45%,transparent)]" />

      <section
        className={cn(
          "absolute flex flex-col pointer-events-auto",
          tv
            ? "top-[8rem] left-[7.5rem] w-[64rem] gap-5"
            : "top-16 left-5 right-5 gap-2 md:right-auto md:w-[min(52%,41rem)] tall:sm:top-[15%] tall:sm:left-[5.5%] tall:sm:gap-3.5"
        )}
      >
        <Stamp japanese="一時停止" className={tv ? "text-lg" : "text-[11px] tall:sm:text-[13px]"}>
          EN PAUSA
        </Stamp>
        <h1
          className={cn(
            "font-display leading-[1.12] line-clamp-2",
            tv ? "text-[3.5rem]" : "text-[22px] tall:sm:text-3xl tall:lg:text-[42px]"
          )}
        >
          {props.title}
        </h1>
        <p className={cn("font-semibold text-zinc-200", tv ? "text-[2rem]" : "text-[15px] tall:sm:text-lg tall:lg:text-[22px]")}>{episodeLine}</p>

        <div className="flex flex-wrap gap-2">
          <span className={chip}>Quedan {formatSecondsToTime(left)}</span>
          <span className={chip}>Terminas a las {endsAt}</span>
          <span className={cn(chip, "hidden sm:inline-flex")}>{props.audioLabel}</span>
          <span className={chip}>
            <span className={cn("w-[7px] h-[7px] rounded-full", props.serverHealthy ? "bg-emerald-400" : "bg-amber-400")} />
            {props.serverName}
          </span>
        </div>

        {props.synopsis && (
          // The wrapper hides it on small screens; line-clamp needs the paragraph's own display
          <div className={tv ? "mt-1.5" : "hidden tall:sm:block mt-1"}>
            <p className={cn("text-zinc-300 leading-relaxed line-clamp-3", tv ? "text-[1.4375rem]" : "text-[15px] lg:text-base")}>
              {props.synopsis}
            </p>
          </div>
        )}

        <div ref={actionsRef} data-nav="x" className={cn("flex", tv ? "gap-4 mt-7" : "flex-wrap gap-2 mt-2 tall:sm:gap-2.5 tall:sm:mt-3.5")}>
          <button type="button" onClick={props.onContinue} className={primary}>
            <Play className={cn("fill-current", tv ? "w-7 h-7" : "w-[18px] h-[18px]")} />
            Continuar
          </button>
          {props.onEpisodes && (
            <button type="button" onClick={props.onEpisodes} className={secondary}>
              {!tv && <ListVideo className="w-5 h-5" />}
              Episodios
            </button>
          )}
          {props.onSettings && (
            <button type="button" onClick={props.onSettings} className={secondary}>
              Audio y subtítulos
            </button>
          )}
          <button type="button" onClick={props.onRestart} className={secondary}>
            {!tv && <RotateCcw className="w-5 h-5" />}
            Desde el principio
          </button>
        </div>
      </section>

      {props.next && props.onNext && (
        <aside
          className={cn(
            "absolute flex-col pointer-events-auto",
            tv ? "flex top-[12.5rem] right-[7.5rem] w-[31rem] gap-4" : "hidden md:flex top-[4.5rem] right-6 w-[min(28%,15rem)] gap-2 tall:top-[18.5%] tall:right-[5.5%] tall:w-[min(26%,24rem)] tall:gap-3"
          )}
        >
          <Stamp muted japanese="次のエピソード" className={tv ? "text-lg" : "text-[11px] tall:text-[13px]"}>
            A CONTINUACIÓN
          </Stamp>
          <button
            type="button"
            tabIndex={tv ? -1 : 0}
            onClick={props.onNext}
            className={cn(
              "flex flex-col text-left outline-none",
              tv ? "gap-4" : "gap-2 p-2 tall:gap-3 tall:p-3 rounded-[18px] bg-zinc-900/85 border border-white/[0.08] hover:bg-zinc-800/90 focus-visible:ring-2 focus-visible:ring-white"
            )}
          >
            <span className={cn("relative block w-full aspect-video overflow-hidden bg-zinc-800", tv ? "rounded-[1.375rem]" : "rounded-xl")}>
              {props.next.thumbnail && (
                <img src={props.next.thumbnail} alt="" className="absolute inset-0 w-full h-full object-cover" />
              )}
              {props.next.duration && !tv && (
                <span className="absolute bottom-2.5 right-2.5 px-2 py-0.5 rounded-md bg-black/85 text-xs font-bold">
                  {props.next.duration} min
                </span>
              )}
            </span>
            <span className={cn("flex flex-col gap-1", !tv && "px-1 pb-1")}>
              <span className={cn("font-bold line-clamp-2", tv ? "text-[1.625rem]" : "text-sm tall:text-[17px]")}>
                Episodio {props.next.number}
                {props.next.title ? ` · ${props.next.title}` : ""}
              </span>
              <span className={cn("text-zinc-400", tv ? "text-[1.3125rem]" : "text-xs tall:text-sm")}>
                {[tv && props.next.duration ? `${props.next.duration} min` : null, props.autoplayNext ? "Empieza solo al terminar este" : null]
                  .filter(Boolean)
                  .join(" · ") || "Siguiente episodio"}
              </span>
            </span>
          </button>
        </aside>
      )}

      {tv && (
        <RemoteHints
          className="absolute right-[7.5rem] bottom-14"
          hints={[
            ["OK", "Continuar"],
            ["◀ ▶", "Opciones"],
            ["⟵", "Volver a la ficha"],
          ]}
        />
      )}
    </div>
  );
}
