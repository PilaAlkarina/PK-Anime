"use client";

import { useEffect, useState } from "react";
import { ChevronLeft, RotateCcw, WifiOff } from "lucide-react";
import { Keycap } from "@/components/brand";
import { cn } from "@/lib/utils";

export type PlayerErrorKind =
  /** Every server answered that it doesn't have the episode (usually: it has only just aired) */
  | "unavailable"
  /** The episode's air date is still ahead */
  | "not-aired"
  /** The device has no connection */
  | "offline"
  /** The servers failed for some other reason */
  | "failed";

export interface TriedServer {
  name: string;
  /** "missing": the server works but doesn't have the episode; "error": it failed */
  reason: "missing" | "error";
  /** What went wrong, for "error": "No responde", "Error del servidor (502)"… */
  detail?: string;
}

/** Stamp and Japanese word per kind; waits wear the second accent, failures the accent */
const STAMPS: Record<PlayerErrorKind, { label: string; japanese: string; wait: boolean }> = {
  unavailable: { label: "AÚN NO DISPONIBLE", japanese: "配信待ち", wait: false },
  "not-aired": { label: "PRÓXIMAMENTE", japanese: "放送予定", wait: true },
  offline: { label: "SIN CONEXIÓN", japanese: "オフライン", wait: true },
  failed: { label: "NO SE PUEDE VER", japanese: "再生エラー", wait: false },
};

/** "hace 25 min", "hace 3 h", "hace 2 días" */
function agoLabel(seconds: number) {
  const minutes = Math.max(1, Math.round(seconds / 60));
  if (minutes < 60) return `hace ${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `hace ${hours} h`;
  return `hace ${Math.round(hours / 24)} días`;
}

/** "2:12", or "1 h 05 min" past an hour */
function clockLabel(seconds: number) {
  const s = Math.max(0, Math.round(seconds));
  const hours = Math.floor(s / 3600);
  const minutes = Math.floor((s % 3600) / 60);
  if (hours > 0) return `${hours} h ${String(minutes).padStart(2, "0")} min`;
  return `${minutes}:${String(s % 60).padStart(2, "0")}`;
}

/** Days / hours / minutes still to go, the largest units only */
function countdownParts(seconds: number): { value: number; unit: string }[] {
  const s = Math.max(0, Math.floor(seconds));
  const days = Math.floor(s / 86400);
  const hours = Math.floor((s % 86400) / 3600);
  const minutes = Math.floor((s % 3600) / 60);
  if (days > 0) return [{ value: days, unit: days === 1 ? "día" : "días" }, { value: hours, unit: "horas" }, { value: minutes, unit: "min" }];
  if (hours > 0) return [{ value: hours, unit: hours === 1 ? "hora" : "horas" }, { value: minutes, unit: "min" }, { value: s % 60, unit: "seg" }];
  return [{ value: minutes, unit: "min" }, { value: s % 60, unit: "seg" }];
}

const weekday = new Intl.DateTimeFormat("es", { weekday: "long" });
const dayMonth = new Intl.DateTimeFormat("es", { day: "numeric", month: "long" });
const time = new Intl.DateTimeFormat("es", { hour: "2-digit", minute: "2-digit" });

/** "Se emite el domingo a las 14:00" within a week, "Se emite el 12 de noviembre a las 14:00" after */
function airsLabel(airingAt: number, now: number) {
  const date = new Date(airingAt * 1000);
  const days = (airingAt * 1000 - now) / 86_400_000;
  return `Se emite el ${days < 6.5 ? weekday.format(date) : dayMonth.format(date)} a las ${time.format(date)}`;
}

function useNow() {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  return now;
}

/**
 * What the player shows when it can't play: why (not out on any server yet, not aired yet, no
 * connection, or a failure), what happens next (the next check, the countdown, waiting for the
 * connection) and the ways out. Over the episode's art, darkened, with the episode number large
 * and outlined behind, in the «Tinta y sello» style; colors come from the active theme.
 */
export function PlayerErrorScreen({
  kind,
  tv,
  poster,
  animeTitle,
  episode,
  detail,
  airingAt,
  nextCheckAt,
  checkEveryMs,
  checks = 0,
  resumeAt = 0,
  tried = [],
  onRetry,
  onChooseServer,
  onBack,
}: {
  kind: PlayerErrorKind;
  tv: boolean;
  poster?: string | null;
  animeTitle: string;
  episode: number;
  /** The underlying message, for "failed" */
  detail?: string | null;
  /** When the episode airs or aired (Unix seconds) */
  airingAt?: number | null;
  /** When it checks again on its own (ms timestamp), and how long that wait is in all */
  nextCheckAt?: number | null;
  checkEveryMs?: number | null;
  /** How many times it has checked so far */
  checks?: number;
  /** Where playback was when the connection dropped (seconds) */
  resumeAt?: number;
  tried?: TriedServer[];
  onRetry: () => void;
  onChooseServer?: () => void;
  onBack?: () => void;
}) {
  const now = useNow();
  const stamp = STAMPS[kind];
  const sinceAired = airingAt ? now / 1000 - airingAt : null;
  const ep = String(episode).padStart(2, "0");

  const title =
    kind === "offline" ? "Se ha perdido la conexión" : kind === "failed" ? "No se ha podido reproducir" : animeTitle;
  const meta =
    kind === "failed"
      ? [animeTitle, `Episodio ${episode}`]
      : kind === "not-aired"
        ? [`Episodio ${episode}`, airingAt ? airsLabel(airingAt, now) : "Sin fecha de emisión"]
        : kind === "unavailable"
          ? [`Episodio ${episode}`, ...(sinceAired !== null && sinceAired >= 0 ? [`Se emitió ${agoLabel(sinceAired)}`] : [])]
          : null;
  const resumeText = resumeAt > 0 ? `En cuanto vuelva internet seguimos en el minuto ${clockLabel(resumeAt)} del episodio ${episode}.` : "En cuanto vuelva internet, el episodio se carga solo.";
  const description =
    kind === "unavailable"
      ? "Ningún servidor lo ha subido todavía. Suelen tardar entre media hora y unas horas desde la emisión. Lo seguimos comprobando solos: cuando aparezca, empieza a reproducirse."
      : kind === "not-aired"
        ? "Después de la emisión, los servidores aún tardan un poco en subirlo."
        : kind === "offline"
          ? `Comprueba el wifi o el cable${tv ? " de la TV" : ""}. ${resumeText}`
          : tried.length === 0
            ? detail || "Los servidores han fallado al cargar el vídeo."
            : null;

  const button = (primary: boolean) =>
    tv
      ? cn(
          "flex items-center gap-3 h-[4.2rem] px-8 rounded-full border-[1.5px] text-[1.5rem] font-bold outline-none transition",
          "focus:bg-white focus:text-black focus:border-white focus:koma",
          primary ? "bg-red-500 border-red-500 text-black" : "bg-ink-3 border-line text-zinc-100"
        )
      : cn(
          "flex items-center gap-2 h-11 px-6 rounded-full text-[0.95rem] font-bold outline-none focus-visible:koma-sm",
          primary ? "bg-red-500 text-black shadow-hard hover:bg-red-400" : "bg-ink-3 border-[1.5px] border-line hover:bg-zinc-800"
        );
  const icon = tv ? "w-6 h-6" : "w-[1.05rem] h-[1.05rem]";

  // Recheck ring: how much of the wait has gone by
  const waitLeft = nextCheckAt ? Math.max(0, nextCheckAt - now) : 0;
  const waitDone = nextCheckAt && checkEveryMs ? 1 - Math.min(1, waitLeft / checkEveryMs) : 0;

  return (
    <div
      role="alert"
      onClick={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
      className="absolute inset-0 z-50 overflow-hidden bg-black animate-in fade-in duration-200"
    >
      {/* The episode's art, blurred and darkened from the left where the text goes */}
      {poster && (
        <img src={poster} alt="" decoding="async" className="absolute inset-[-6%] w-[112%] h-[112%] object-cover blur-xl opacity-80" />
      )}
      <div className="absolute inset-0 bg-[linear-gradient(90deg,rgb(var(--c-ink))_0%,rgba(var(--c-ink),0.93)_34%,rgba(var(--c-ink),0.6)_68%,rgba(var(--c-ink),0.38)_100%)]" />
      <div className="absolute inset-0 bg-gradient-to-t from-black/75 to-transparent to-40%" />
      <div aria-hidden="true" className="absolute inset-0 screentone [mask-image:linear-gradient(90deg,transparent,#000_40%,transparent_85%)]" />

      {/* Episode number, large and outlined, with the accent offset behind */}
      {kind !== "offline" && (
        <span aria-hidden="true" className={cn("absolute right-[4%] -bottom-[0.12em] font-display leading-[0.8] select-none", tv ? "text-[21rem]" : "text-[9rem] sm:text-[15rem]")}>
          <span className="absolute left-[0.045em] top-[0.045em] text-transparent [-webkit-text-stroke:0.012em_rgba(var(--c-accent),0.45)]">{ep}</span>
          <span className="relative text-transparent [-webkit-text-stroke:0.012em_rgba(var(--c-paper),0.28)]">{ep}</span>
        </span>
      )}

      {/* Ways back: a round button on PC, the remote's Back key on TV */}
      {onBack &&
        (tv ? (
          <p className="absolute top-[3.6rem] left-[10rem] flex items-center gap-3 text-[1.15rem] font-medium text-zinc-200">
            <Keycap>⟵</Keycap> Volver a la ficha
          </p>
        ) : (
          <button
            type="button"
            onClick={onBack}
            aria-label="Volver a la ficha"
            className="absolute top-5 left-5 flex items-center justify-center w-11 h-11 rounded-full bg-ink-3/85 border-[1.5px] border-line hover:bg-zinc-800 outline-none focus-visible:koma-sm"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
        ))}

      <div
        className={cn(
          "absolute top-1/2 -translate-y-1/2 flex flex-col items-start",
          tv ? "left-[10rem] max-w-[62rem] gap-[1.35rem]" : "left-6 right-6 sm:left-20 sm:right-auto max-w-[40rem] gap-3.5"
        )}
      >
        {kind === "offline" && (
          <span
            aria-hidden="true"
            className={cn("flex items-center justify-center rounded-full bg-ink-3 border-[1.5px] border-line text-amber-500", tv ? "w-[5.2rem] h-[5.2rem]" : "w-14 h-14")}
          >
            <WifiOff className={tv ? "w-10 h-10" : "w-7 h-7"} />
          </span>
        )}

        <span className={cn("inline-flex items-center gap-[0.9em]", tv ? "text-[1.1rem]" : "text-[0.78rem]")}>
          <span
            className={cn(
              "inline-flex px-[0.75em] py-[0.3em] rounded-md border-2 font-black tracking-[0.14em] -rotate-2 bg-black/85",
              stamp.wait ? "border-amber-500 text-amber-500" : "border-red-500 text-red-500"
            )}
          >
            {stamp.label}
          </span>
          <span lang="ja" aria-hidden="true" className="font-medium tracking-[0.2em] text-zinc-400">
            {stamp.japanese}
          </span>
        </span>

        <h2 className={cn("font-display leading-[1.1] [text-wrap:balance]", tv ? "text-[4.4rem]" : "text-[1.9rem] sm:text-[2.6rem]")}>{title}</h2>

        {meta && (
          <p className={cn("flex flex-wrap items-center gap-[0.6em] font-bold text-zinc-200", tv ? "text-[1.8rem]" : "text-[1.1rem]")}>
            {meta.map((part, i) => (
              <span key={part} className="flex items-center gap-[0.6em]">
                {i > 0 && <i className="w-[0.3em] h-[0.3em] rounded-full bg-zinc-500" />}
                {part}
              </span>
            ))}
          </p>
        )}

        {kind === "not-aired" && airingAt && (
          <div className={cn("flex items-end", tv ? "gap-[1.8rem] my-1" : "gap-5 my-0.5")} aria-label={`Faltan ${countdownParts(airingAt - now / 1000).map((p) => `${p.value} ${p.unit}`).join(", ")}`}>
            {countdownParts(airingAt - now / 1000).map((part, i, all) => (
              <div key={part.unit} className="flex flex-col items-start">
                <span
                  className={cn(
                    "font-display leading-[0.9] tabular-nums",
                    tv ? "text-[5.6rem]" : "text-[3.4rem]",
                    i === all.length - 1 ? "text-red-500" : "text-transparent [-webkit-text-stroke:0.035em_rgb(var(--c-paper))]"
                  )}
                >
                  {part.value}
                </span>
                <span className={cn("font-bold uppercase tracking-[0.08em] text-zinc-400", tv ? "text-[1.1rem] mt-1.5" : "text-xs mt-1")}>{part.unit}</span>
              </div>
            ))}
          </div>
        )}

        {description && (
          <p className={cn("leading-[1.55] text-zinc-400", tv ? "text-[1.45rem] max-w-[40em]" : "text-[0.98rem] max-w-[34em]")}>{description}</p>
        )}

        {kind === "unavailable" && nextCheckAt && (
          <p className={cn("flex items-center gap-[0.8em] font-bold text-zinc-200 tabular-nums", tv ? "text-[1.3rem]" : "text-[0.88rem]")}>
            <svg viewBox="0 0 36 36" aria-hidden="true" className="w-[1.6em] h-[1.6em] flex-none">
              <circle cx="18" cy="18" r="15" fill="none" strokeWidth="3.2" className="stroke-white/[0.18]" />
              <circle
                cx="18"
                cy="18"
                r="15"
                fill="none"
                strokeWidth="3.2"
                strokeLinecap="round"
                strokeDasharray="94.2"
                strokeDashoffset={94.2 * (1 - waitDone)}
                className="stroke-red-500 -rotate-90 origin-center transition-[stroke-dashoffset] duration-1000 ease-linear"
              />
            </svg>
            Próxima comprobación en {clockLabel(waitLeft / 1000)}
            {checks > 0 && <small className="font-medium text-zinc-500 text-[0.95em]">· comprobado {checks === 1 ? "1 vez" : `${checks} veces`}</small>}
          </p>
        )}

        {kind === "offline" && (
          <p className={cn("flex items-center gap-[0.8em] font-bold text-zinc-200", tv ? "text-[1.35rem]" : "text-[0.9rem]")}>
            <span className="block w-[9em] h-1 rounded-full bg-white/[0.18] overflow-hidden">
              <span className="block h-full w-1/3 rounded-full bg-red-500 loading-slide" />
            </span>
            Esperando a que vuelva la conexión…
          </p>
        )}

        {tried.length > 0 && (kind === "failed" || kind === "unavailable") && (
          <ul
            aria-label="Servidores probados"
            className={cn("flex flex-col rounded-xl bg-ink-3/[0.92] border-[1.5px] border-line overflow-hidden", tv ? "w-[36em] text-[1.3rem]" : "w-full max-w-[26em] text-[0.9rem]")}
          >
            {tried.map((server) => (
              <li key={server.name} className="flex items-center gap-[0.7em] px-[0.9em] py-[0.62em] border-b border-line last:border-b-0">
                <i className={cn("w-[0.55em] h-[0.55em] flex-none rounded-full", server.reason === "missing" ? "bg-amber-500" : "bg-red-500")} />
                <b className="flex-1 font-bold">{server.name}</b>
                <span className="font-medium text-zinc-400">
                  {server.reason === "missing" ? "Sin el episodio" : server.detail || "Ha fallado"}
                </span>
              </li>
            ))}
          </ul>
        )}

        <div data-nav="x" className={cn("flex flex-wrap items-center", tv ? "gap-[1.3rem] mt-3" : "gap-3 mt-2")}>
          {kind === "not-aired" ? (
            onBack && (
              <button type="button" autoFocus={tv} onClick={onBack} className={button(true)}>
                Volver a la ficha
              </button>
            )
          ) : (
            <>
              <button type="button" autoFocus={tv} onClick={onRetry} className={button(true)}>
                <RotateCcw className={icon} />
                {kind === "unavailable" ? "Reintentar ahora" : "Reintentar"}
              </button>
              {kind === "failed" && onChooseServer && (
                <button type="button" onClick={onChooseServer} className={button(false)}>
                  Elegir servidor
                </button>
              )}
              {onBack && !(tv && kind === "failed") && (
                <button type="button" onClick={onBack} className={button(false)}>
                  Volver a la ficha
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
