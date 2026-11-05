"use client";

import { useEffect, useState } from "react";
import { Stamp } from "@/components/brand";
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
  /** "missing": the server doesn't have the episode; "error": it failed */
  reason: "missing" | "error";
}

const COPY: Record<PlayerErrorKind, { stamp: string; japanese: string; title: string }> = {
  unavailable: { stamp: "AÚN NO DISPONIBLE", japanese: "準備中", title: "Este episodio todavía no está en ningún servidor" },
  "not-aired": { stamp: "PRÓXIMAMENTE", japanese: "放送前", title: "Este episodio todavía no se ha emitido" },
  offline: { stamp: "SIN CONEXIÓN", japanese: "オフライン", title: "No hay conexión a internet" },
  failed: { stamp: "ERROR", japanese: "再生エラー", title: "No se ha podido reproducir este episodio" },
};

/** "hace 25 min", "hace 3 h", "hace 2 días" */
function agoLabel(seconds: number) {
  const minutes = Math.max(1, Math.round(seconds / 60));
  if (minutes < 60) return `hace ${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `hace ${hours} h`;
  return `hace ${Math.round(hours / 24)} días`;
}

/** "2 d 4 h", "3 h 12 min", "12:30" (mm:ss under an hour) */
function countdownLabel(seconds: number) {
  const s = Math.max(0, Math.round(seconds));
  const days = Math.floor(s / 86400);
  const hours = Math.floor((s % 86400) / 3600);
  const minutes = Math.floor((s % 3600) / 60);
  if (days > 0) return `${days} d ${hours} h`;
  if (hours > 0) return `${hours} h ${minutes} min`;
  return `${minutes}:${String(s % 60).padStart(2, "0")}`;
}

const airDate = new Intl.DateTimeFormat("es", { weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" });

function useNow(active: boolean) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [active]);
  return now;
}

/**
 * What the player shows when it can't play: why (not out on any server yet, not aired yet, no
 * connection, or a failure), what happens next (when it checks again, when it airs) and what can
 * be done. Covers the player like the loading veil, over the episode's art.
 */
export function PlayerErrorScreen({
  kind,
  tv,
  poster,
  detail,
  airingAt,
  nextCheckAt,
  tried = [],
  onRetry,
  onChooseServer,
  onBack,
}: {
  kind: PlayerErrorKind;
  tv: boolean;
  poster?: string | null;
  /** The underlying message, for "failed" */
  detail?: string | null;
  /** When the episode airs or aired (Unix seconds) */
  airingAt?: number | null;
  /** When it checks again on its own (ms timestamp) */
  nextCheckAt?: number | null;
  tried?: TriedServer[];
  onRetry: () => void;
  onChooseServer?: () => void;
  onBack?: () => void;
}) {
  const now = useNow(kind === "not-aired" || !!nextCheckAt);
  const copy = COPY[kind];
  const sinceAired = airingAt ? now / 1000 - airingAt : null;

  let lines: string[] = [];
  if (kind === "unavailable") {
    lines = [
      sinceAired !== null && sinceAired >= 0 && sinceAired < 7 * 86400
        ? `Se emitió ${agoLabel(sinceAired)}. Los servidores suelen tardar un rato en subirlo.`
        : "Ningún servidor lo tiene ahora mismo.",
    ];
  } else if (kind === "not-aired") {
    lines = airingAt
      ? [`Se emite el ${airDate.format(new Date(airingAt * 1000))}.`, `Faltan ${countdownLabel(airingAt - now / 1000)}.`]
      : ["Aún no tiene fecha de emisión."];
  } else if (kind === "offline") {
    lines = ["Se vuelve a intentar solo en cuanto vuelva la conexión."];
  } else {
    lines = [detail || "Los servidores han fallado al cargar el vídeo."];
  }
  if (nextCheckAt && kind === "unavailable") {
    lines.push(`Se vuelve a comprobar en ${countdownLabel((nextCheckAt - now) / 1000)}.`);
  }

  const button = (primary: boolean) =>
    tv
      ? cn(
          "flex items-center gap-3 h-16 px-[1.625rem] rounded-full border-[1.5px] text-[1.3125rem] font-bold outline-none transition",
          "focus:bg-white focus:text-black focus:border-white focus:koma",
          primary ? "bg-red-500 border-red-500 text-black" : "bg-ink-3/90 border-line text-zinc-200"
        )
      : cn(
          "h-11 px-5 rounded-full text-sm font-bold outline-none focus-visible:ring-2 focus-visible:ring-white/60",
          primary ? "bg-red-500 text-black hover:bg-red-400 shadow-hard" : "bg-ink-3 border-[1.5px] border-line hover:bg-zinc-800"
        );

  return (
    <div
      role="alert"
      onClick={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
      className="absolute inset-0 z-50 flex items-center justify-center overflow-hidden bg-black animate-in fade-in duration-200"
    >
      {poster && (
        <img src={poster} alt="" decoding="async" className="absolute inset-0 w-full h-full object-cover scale-110 blur-2xl opacity-30" />
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-black via-black/70 to-black/50" />
      <div aria-hidden="true" className="absolute inset-0 screentone [mask-image:radial-gradient(ellipse_at_center,#000,transparent_70%)]" />

      <div className={cn("relative flex flex-col items-center px-6 text-center", tv ? "gap-6 max-w-[56rem]" : "gap-3.5 max-w-md")}>
        <Stamp japanese={copy.japanese} muted={kind === "offline"} backed className={tv ? "text-lg" : "text-[11px] sm:text-[13px]"}>
          {copy.stamp}
        </Stamp>
        <h2 className={cn("font-display leading-tight", tv ? "text-[3rem]" : "text-xl sm:text-2xl")}>{copy.title}</h2>
        <div className={cn("space-y-1 text-zinc-300", tv ? "text-2xl" : "text-sm sm:text-base")}>
          {lines.map((line) => (
            <p key={line} className={line.startsWith("Se vuelve") || line.startsWith("Faltan") ? "tabular-nums text-zinc-400" : undefined}>
              {line}
            </p>
          ))}
        </div>

        {tried.length > 0 && kind !== "offline" && kind !== "not-aired" && (
          <ul className={cn("flex flex-wrap justify-center gap-2", tv ? "text-lg" : "text-xs")}>
            {tried.map((server) => (
              <li
                key={server.name}
                className={cn("flex items-center gap-2 rounded-full bg-black/70 border border-line", tv ? "px-4 py-1.5" : "px-3 py-1")}
              >
                <span className={cn("rounded-full", tv ? "w-2.5 h-2.5" : "w-2 h-2", server.reason === "missing" ? "bg-zinc-500" : "bg-red-500")} />
                <span className="font-bold">{server.name}</span>
                <span className="text-zinc-400">{server.reason === "missing" ? "sin el episodio" : "error"}</span>
              </li>
            ))}
          </ul>
        )}

        <div data-nav="x" className={cn("flex flex-wrap justify-center", tv ? "gap-4 pt-2" : "gap-2.5 pt-1")}>
          {kind !== "not-aired" && (
            <button type="button" autoFocus={tv} onClick={onRetry} className={button(true)}>
              {kind === "unavailable" ? "Comprobar ahora" : "Reintentar"}
            </button>
          )}
          {kind === "failed" && onChooseServer && (
            <button type="button" onClick={onChooseServer} className={button(false)}>
              Elegir servidor
            </button>
          )}
          {onBack && (
            <button type="button" autoFocus={tv && kind === "not-aired"} onClick={onBack} className={button(kind === "not-aired")}>
              Volver a la ficha
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
