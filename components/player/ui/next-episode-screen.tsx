"use client";

import { useEffect, useRef } from "react";
import { Check, Maximize, Play } from "lucide-react";
import { cn } from "@/lib/utils";
import { focusFirst } from "./focus-nav";
import { RemoteHints } from "./remote-hints";
import type { NextEpisodeInfo } from "./types";

interface NextEpisodeScreenProps {
  tv: boolean;
  /** Desktop: the credits keep playing in a frame on the left instead of behind the card */
  framed: boolean;
  title: string;
  episode: number;
  next: NextEpisodeInfo;
  /** Seconds left, or null when the countdown is off or was cancelled */
  countdown: number | null;
  countdownFrom: number;
  /** 0–1, drawn under the framed credits */
  progress: number;
  /** The list service the episode was just marked watched on, if any */
  markedOn: string | null;
  onPlayNow: () => void;
  onCancel: () => void;
  onWatchCredits: () => void;
}

function CountdownRing({ value, from, size }: { value: number; from: number; size: number }) {
  const r = size / 2 - size * 0.055;
  const circumference = 2 * Math.PI * r;
  return (
    <div className="relative flex items-center justify-center rounded-full bg-black/70" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true" className="absolute inset-0 -rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.18)" strokeWidth={size * 0.055} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="#fafafa"
          strokeWidth={size * 0.055}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - value / from)}
          className="transition-[stroke-dashoffset] duration-1000 ease-linear"
        />
      </svg>
      <span className="relative font-extrabold tabular-nums" style={{ fontSize: size * 0.36 }}>
        {value}
      </span>
    </div>
  );
}

/** Up next: shown when the ending starts (or the video ends), with a countdown to the next episode */
export function NextEpisodeScreen(props: NextEpisodeScreenProps) {
  const { tv, framed, next, countdown } = props;
  const actionsRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (tv) focusFirst(actionsRef.current);
  }, [tv]);

  const primary = cn(
    "flex items-center gap-2.5 rounded-full bg-white text-black font-bold outline-none transition-transform",
    tv
      ? "h-[4.75rem] px-10 text-[1.625rem] focus:outline focus:outline-[5px] focus:outline-white/35 focus:outline-offset-[6px] focus:scale-105"
      : "h-12 sm:h-[52px] px-6 text-base hover:bg-zinc-200"
  );
  const secondary = cn(
    "flex items-center gap-2 rounded-full font-semibold outline-none transition",
    tv
      ? "h-[4.75rem] px-8 text-2xl bg-white/[0.12] text-zinc-200 focus:bg-white focus:text-black focus:outline focus:outline-[5px] focus:outline-white/35 focus:outline-offset-[6px] focus:scale-105"
      : "h-12 sm:h-[52px] px-5 text-base bg-white/[0.14] hover:bg-white/25"
  );

  const malLine = props.markedOn && (
    <span className={cn("flex items-center gap-2 text-zinc-400", tv ? "text-[1.375rem] gap-3.5" : "text-sm")}>
      <Check className={cn("text-emerald-400", tv ? "w-7 h-7" : "w-4 h-4")} strokeWidth={2.6} />
      Episodio {props.episode} marcado como visto en {props.markedOn}
    </span>
  );

  return (
    <div
      role="dialog"
      aria-label="Siguiente episodio"
      className="absolute inset-0 z-30 animate-in fade-in duration-300"
      onClick={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
    >
      {!framed && <div className="absolute inset-0 bg-gradient-to-l from-black/95 via-black/85 to-black/20" />}

      {framed && (
        <button
          type="button"
          onClick={props.onWatchCredits}
          aria-label="Ver los créditos"
          className="absolute left-[5.5%] top-[18.5%] w-[48.6%] h-[48.6%] rounded-[18px] overflow-hidden outline-none focus-visible:ring-2 focus-visible:ring-white"
        >
          <span className="absolute inset-x-0 bottom-0 h-[5px] bg-white/20">
            <span className="block h-full bg-red-500" style={{ width: `${Math.min(100, props.progress * 100)}%` }} />
          </span>
        </button>
      )}

      {framed && (
        <div className="absolute left-[5.5%] w-[48.6%] top-[71%] flex items-center justify-between gap-4">
          <button type="button" onClick={props.onWatchCredits} className="flex items-center gap-2 h-11 px-[18px] rounded-full bg-white/[0.12] hover:bg-white/20 text-[15px] font-semibold">
            <Maximize className="w-[18px] h-[18px]" />
            Ver los créditos
          </button>
          {malLine}
        </div>
      )}

      <section
        className={cn(
          "absolute flex flex-col",
          tv
            ? "top-[10.5rem] right-[7.5rem] w-[45rem] gap-5"
            : framed
              ? "top-[18.5%] left-[59.7%] w-[min(34.7%,32rem)] gap-3.5"
              : "top-1/2 -translate-y-1/2 right-5 sm:right-[5.5%] w-[min(calc(100%-2.5rem),26rem)] gap-3"
        )}
      >
        <span className={cn("font-bold tracking-[0.16em] text-red-300", tv ? "text-lg" : "text-[13px]")}>SIGUIENTE EPISODIO</span>
        <div
          className={cn(
            "relative w-full aspect-video overflow-hidden bg-zinc-800 flex items-center justify-center",
            tv ? "rounded-3xl" : "rounded-[18px]",
            !framed && !tv && "hidden sm:flex"
          )}
        >
          {next.thumbnail && <img src={next.thumbnail} alt="" className="absolute inset-0 w-full h-full object-cover" />}
          {countdown !== null && <CountdownRing value={countdown} from={props.countdownFrom} size={tv ? 156 : 112} />}
        </div>
        <h2 className={cn("font-extrabold leading-tight tracking-tight", tv ? "mt-1.5 text-[3.25rem]" : "mt-1 text-2xl sm:text-[34px]")}>
          Episodio {next.number}
        </h2>
        {(next.title || next.duration) && (
          <p className={cn("text-zinc-200", tv ? "text-[1.75rem]" : "text-base sm:text-xl")}>
            {[next.title, next.duration ? `${next.duration} min` : null].filter(Boolean).join(" · ")}
          </p>
        )}
        <div ref={actionsRef} data-nav="x" className={cn("flex flex-wrap", tv ? "gap-[1.125rem] mt-4" : "gap-2.5 mt-2")}>
          <button type="button" onClick={props.onPlayNow} className={primary}>
            <Play className={cn("fill-current", tv ? "w-7 h-7" : "w-[18px] h-[18px]")} />
            Ver ahora
          </button>
          {tv ? (
            <button type="button" onClick={props.onWatchCredits} className={secondary}>
              Ver los créditos
            </button>
          ) : (
            <button type="button" onClick={framed ? props.onCancel : props.onWatchCredits} className={secondary}>
              {framed ? "Cancelar" : "Seguir viendo"}
            </button>
          )}
        </div>
        {countdown !== null && !tv && (
          <p className="mt-1 text-[13px] text-zinc-400">
            Empieza en {countdown} s. Puedes desactivar la reproducción automática en Ajustes.
          </p>
        )}
        {!framed && !tv && <div className="mt-1">{malLine}</div>}
      </section>

      {tv && (
        <>
          {props.markedOn && <div className="absolute left-[7.5rem] bottom-[7.5rem]">{malLine}</div>}
          <RemoteHints
            className="absolute right-[7.5rem] bottom-14"
            hints={[
              ["OK", "Ver ahora"],
              ["⟵", "Cancelar"],
            ]}
          />
        </>
      )}
    </div>
  );
}
