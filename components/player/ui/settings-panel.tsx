"use client";

import type React from "react";
import { useEffect, useRef } from "react";
import { Check, ChevronLeft, ChevronRight, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useServiceStatus } from "@/lib/use-service-status";
import type { SubtitleStyles } from "../subtitle-settings-dialog";
import { focusFirst } from "./focus-nav";
import { SubtitleText } from "./subtitle-text";
import { formatSeconds } from "./types";

export type PanelView = "main" | "subtitles" | "style" | "quality" | "speed" | "boost";

export interface PanelSubtitle {
  key: string;
  label: string;
}

export interface PanelServer {
  id: string;
  name: string;
  active: boolean;
  onSelect: () => void;
}

interface SettingsPanelProps {
  tv: boolean;
  view: PanelView;
  onViewChange: (view: PanelView) => void;
  onClose: () => void;

  audio: "sub" | "dub";
  hasDub: boolean;
  onAudioChange: (audio: "sub" | "dub") => void;

  subtitles: PanelSubtitle[];
  activeSubtitle: string | null;
  onSubtitleChange: (key: string | null) => void;
  subtitleStyles: SubtitleStyles;
  onSubtitleStylesChange: (styles: SubtitleStyles) => void;

  qualities: { index: number; name: string; height: number }[];
  quality: number;
  onQualityChange: (index: number) => void;

  speed: number;
  onSpeedChange: (speed: number) => void;
  boost: number;
  onBoostChange: (boost: number) => void;

  autoSkipIntro: boolean;
  onAutoSkipIntroChange: (on: boolean) => void;
  autoSkipOutro: boolean;
  onAutoSkipOutroChange: (on: boolean) => void;
  /** Only where there is a next episode to play */
  autoplayNext?: boolean;
  onAutoplayNextChange?: (on: boolean) => void;

  servers: PanelServer[];
}

const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2];
const BOOSTS = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];

const FONT_OPTIONS = [
  { value: "sans", label: "Sans" },
  { value: "anime", label: "Anime" },
  { value: "serif", label: "Serif" },
  { value: "mono", label: "Mono" },
] as const;
const SIZE_OPTIONS = [
  { value: "sm", label: "Pequeño" },
  { value: "base", label: "Mediano" },
  { value: "lg", label: "Grande" },
  { value: "xl", label: "Muy grande" },
] as const;
const COLOR_OPTIONS = [
  { value: "#ffffff", label: "blanco" },
  { value: "#facc15", label: "amarillo" },
  { value: "#38bdf8", label: "cian" },
  { value: "#4ade80", label: "verde" },
  { value: "#f472b6", label: "rosa" },
];
const BACKGROUND_OPTIONS = [
  { value: "transparent", label: "Sin fondo" },
  { value: "rgba(0, 0, 0, 0.4)", label: "Difuminado" },
  { value: "rgba(0, 0, 0, 0.85)", label: "Sólido" },
];
const OUTLINE_OPTIONS = [
  { value: "thick", label: "Grueso" },
  { value: "thin", label: "Fino" },
  { value: "none", label: "Sombra" },
] as const;

export const speedLabel = (speed: number) =>
  speed === 1 ? "Normal" : `${speed.toLocaleString("es-ES")}×`;

export function qualityLabel(qualities: SettingsPanelProps["qualities"], quality: number) {
  const top = qualities.reduce((max, q) => Math.max(max, q.height), 0);
  if (quality === -1) return top ? `Auto · ${top}p` : "Auto";
  return qualities.find((q) => q.index === quality)?.name || "Auto";
}

function styleLabel(styles: SubtitleStyles) {
  const size = SIZE_OPTIONS.find((s) => s.value === styles.fontSize)?.label || "Mediano";
  const color = COLOR_OPTIONS.find((c) => c.value === styles.color)?.label;
  return color ? `${size}, ${color}` : size;
}

const VIEW_TITLES: Record<Exclude<PanelView, "main">, string> = {
  subtitles: "Subtítulos",
  style: "Estilo de subtítulos",
  quality: "Calidad",
  speed: "Velocidad",
  boost: "Amplificar volumen",
};

/**
 * Side panel with every playback option. On TV the arrows move through it in order and
 * Back steps out of a sub-view before closing it.
 */
export function SettingsPanel(props: SettingsPanelProps) {
  const { tv, view, onViewChange, onClose } = props;
  const panelRef = useRef<HTMLDivElement | null>(null);
  // A real check (the server reuses one from the last five minutes): this is where people switch server
  const status = useServiceStatus();

  // Keyboard and remote users land on the first option of every view
  useEffect(() => {
    focusFirst(panelRef.current, "[data-selected='true']");
  }, [view]);

  const rowClass = cn(
    "w-full flex items-center gap-3 px-4 text-left border-b border-white/[0.06] last:border-b-0 outline-none transition-colors",
    // TV only ever focuses; desktop hovers, and shows focus for keyboard users only
    tv ? "h-[4.25rem] text-[1.375rem] focus:bg-white focus:text-black" : "h-[50px] text-sm hover:bg-white/[0.06] focus-visible:bg-white/[0.1]"
  );

  const toggle = (label: string, on: boolean, onChange: (on: boolean) => void) => (
    <button type="button" role="switch" aria-checked={on} onClick={() => onChange(!on)} className={cn(rowClass, "group")}>
      <span className="flex-1 font-medium">{label}</span>
      <span
        className={cn(
          "relative inline-flex shrink-0 items-center rounded-full transition-colors",
          tv ? "w-14 h-8" : "w-10 h-6",
          on ? "bg-red-500" : "bg-zinc-700"
        )}
      >
        <span
          className={cn(
            "absolute rounded-full bg-white transition-transform",
            tv ? "w-6 h-6 left-1" : "w-4 h-4 left-1",
            on && (tv ? "translate-x-6" : "translate-x-4")
          )}
        />
      </span>
    </button>
  );

  const option = (key: string | number, label: string, selected: boolean, onSelect: () => void, extra?: string) => (
    <button
      key={key}
      type="button"
      data-selected={selected}
      aria-pressed={selected}
      onClick={onSelect}
      className={cn(rowClass, "group", selected && "font-semibold")}
    >
      <Check className={cn("shrink-0", tv ? "w-6 h-6" : "w-4 h-4", !selected && "invisible")} />
      <span className="flex-1 truncate">{label}</span>
      {extra && <span className="text-zinc-400 group-focus:text-zinc-600">{extra}</span>}
    </button>
  );

  const chip = (key: string, label: string, selected: boolean, onSelect: () => void, style?: React.CSSProperties) => (
    <button
      key={key}
      type="button"
      data-selected={selected}
      aria-pressed={selected}
      onClick={onSelect}
      style={style}
      className={cn(
        "flex-1 rounded-xl border outline-none transition-colors",
        tv ? "h-14 text-lg focus:bg-white focus:text-black" : "h-9 text-[13px]",
        selected
          ? "bg-white/15 border-white/30 font-semibold"
          : cn("bg-white/[0.04] border-white/10 text-zinc-300", !tv && "hover:bg-white/[0.08] focus-visible:bg-white/[0.12]")
      )}
    >
      {label}
    </button>
  );

  const setStyle = (patch: Partial<SubtitleStyles>) => props.onSubtitleStylesChange({ ...props.subtitleStyles, ...patch });

  const activeSubtitleLabel =
    props.activeSubtitle === null
      ? "Desactivados"
      : props.subtitles.find((s) => s.key === props.activeSubtitle)?.label || "Desactivados";

  const serverNote = (server: PanelServer) => {
    const live = status.services.find((s) => s.id === server.id);
    const time = live && live.state !== "down" ? formatSeconds(live.ms) : null;
    const state = !live ? null : live.state === "down" ? "Caído" : live.state === "degraded" ? "Lento" : null;
    return [server.active ? "En uso" : null, state, time].filter(Boolean).join(" · ");
  };
  const serverDot = (id: string) => {
    const state = status.services.find((s) => s.id === id)?.state;
    return state === "ok" ? "bg-emerald-400" : state === "degraded" ? "bg-amber-400" : state === "down" ? "bg-red-500" : "bg-zinc-500";
  };

  return (
    <div
      ref={panelRef}
      role="dialog"
      aria-label="Ajustes de reproducción"
      data-nav="xy"
      onClick={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
      className={cn(
        "absolute inset-y-0 right-0 z-50 flex flex-col bg-zinc-900 border-l border-white/10 text-white overflow-y-auto overscroll-contain player-menu-scrollbar animate-in slide-in-from-right-8 fade-in duration-200",
        tv ? "w-[36rem] p-8 gap-6" : "w-full sm:w-[400px] p-5 gap-5"
      )}
    >
      {view === "main" ? (
        <>
          <div className="flex items-center justify-between gap-3">
            <h2 className={cn("font-bold", tv ? "text-3xl" : "text-[19px]")}>Ajustes de reproducción</h2>
            {!tv && (
              <button
                type="button"
                onClick={onClose}
                aria-label="Cerrar ajustes"
                className="flex items-center justify-center w-10 h-10 rounded-full bg-white/[0.08] hover:bg-white/[0.16]"
              >
                <X className="w-[18px] h-[18px]" />
              </button>
            )}
          </div>

          <div role="group" aria-label="Audio" className="flex gap-1 p-1 rounded-xl bg-ink-3">
            {(["sub", "dub"] as const).map((a) => (
              <button
                key={a}
                type="button"
                aria-pressed={props.audio === a}
                data-selected={props.audio === a}
                disabled={a === "dub" && !props.hasDub}
                onClick={() => props.onAudioChange(a)}
                className={cn(
                  "flex-1 rounded-[9px] font-semibold outline-none transition-colors disabled:opacity-40",
                  tv ? "h-14 text-xl focus:bg-white focus:text-black" : "h-[38px] text-sm",
                  props.audio === a ? "bg-white text-black" : cn("text-zinc-400", !tv && "hover:text-white focus-visible:bg-white/10")
                )}
              >
                {a === "sub" ? "Original" : "Doblaje en inglés"}
              </button>
            ))}
          </div>

          <div className="flex flex-col rounded-[14px] bg-ink-3 overflow-hidden shrink-0">
            {(
              [
                ["subtitles", "Subtítulos", activeSubtitleLabel],
                ["style", "Estilo de subtítulos", styleLabel(props.subtitleStyles)],
                ["quality", "Calidad", qualityLabel(props.qualities, props.quality)],
                ["speed", "Velocidad", speedLabel(props.speed)],
                ["boost", "Amplificar volumen", `${Math.round(props.boost * 100)} %`],
              ] as const
            ).map(([target, label, value]) => (
              <button key={target} type="button" onClick={() => onViewChange(target)} className={cn(rowClass, "group")}>
                <span className="flex-1 font-medium">{label}</span>
                <span className="text-zinc-400 group-focus:text-zinc-600 truncate max-w-[45%]">{value}</span>
                <ChevronRight className={cn("shrink-0 text-zinc-500", tv ? "w-6 h-6" : "w-4 h-4")} />
              </button>
            ))}
            {toggle("Saltar intro automáticamente", props.autoSkipIntro, props.onAutoSkipIntroChange)}
            {toggle("Saltar ending automáticamente", props.autoSkipOutro, props.onAutoSkipOutroChange)}
            {props.onAutoplayNextChange &&
              toggle("Reproducir el siguiente episodio", Boolean(props.autoplayNext), props.onAutoplayNextChange)}
          </div>

          <div className="flex flex-col gap-2 shrink-0">
            <div className="flex items-baseline justify-between">
              <h3 className={cn("font-bold", tv ? "text-xl" : "text-sm")}>Servidor</h3>
              {status.checkedAt &&
                (tv ? (
                  <span className="text-base text-zinc-400">
                    Estado · {status.checkedAt.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" })}
                  </span>
                ) : (
                  <a href="/status" target="_blank" rel="noopener" className="text-xs text-zinc-400 hover:text-white underline-offset-2 hover:underline">
                    Estado · {status.checkedAt.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" })}
                  </a>
                ))}
            </div>
            <div className="flex flex-col p-1 rounded-[14px] bg-ink-3">
              {props.servers.length === 0 && (
                <p className={cn("px-3 py-3 text-zinc-400", tv ? "text-lg" : "text-sm")}>No hay servidores para este audio</p>
              )}
              {props.servers.map((server) => (
                <button
                  key={server.id}
                  type="button"
                  data-selected={server.active}
                  aria-pressed={server.active}
                  onClick={server.onSelect}
                  className={cn(
                    "flex items-center gap-2.5 px-3 rounded-[10px] text-left outline-none transition-colors group",
                    tv ? "h-16 text-[1.375rem] focus:bg-white focus:text-black" : "h-11 text-sm",
                    server.active ? "bg-zinc-800 font-bold" : !tv && "hover:bg-white/[0.06] focus-visible:bg-white/[0.1]"
                  )}
                >
                  <span className={cn("rounded-full shrink-0", tv ? "w-3 h-3" : "w-2 h-2", serverDot(server.id))} />
                  <span className="flex-1">{server.name}</span>
                  <span className={cn("font-normal text-zinc-400 group-focus:text-zinc-600", tv ? "text-base" : "text-xs")}>
                    {serverNote(server)}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </>
      ) : (
        <>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => onViewChange(view === "style" ? "subtitles" : "main")}
              aria-label="Volver"
              className={cn(
                "flex items-center justify-center rounded-full bg-white/[0.08] hover:bg-white/[0.16] outline-none focus:bg-white focus:text-black",
                tv ? "w-14 h-14" : "w-10 h-10"
              )}
            >
              <ChevronLeft className={tv ? "w-7 h-7" : "w-5 h-5"} />
            </button>
            <h2 className={cn("font-bold", tv ? "text-3xl" : "text-[19px]")}>{VIEW_TITLES[view]}</h2>
          </div>

          {view === "subtitles" && (
            <>
              <div className="flex flex-col rounded-[14px] bg-ink-3 overflow-hidden shrink-0">
                {option("off", "Desactivados", props.activeSubtitle === null, () => props.onSubtitleChange(null))}
                {props.subtitles.map((s) =>
                  option(s.key, s.label, props.activeSubtitle === s.key, () => props.onSubtitleChange(s.key))
                )}
              </div>
              <button type="button" onClick={() => onViewChange("style")} className={cn(rowClass, "rounded-[14px] bg-ink-3 group")}>
                <span className="flex-1 font-medium">Estilo de subtítulos</span>
                <span className="text-zinc-400 group-focus:text-zinc-600">{styleLabel(props.subtitleStyles)}</span>
                <ChevronRight className={cn("shrink-0 text-zinc-500", tv ? "w-6 h-6" : "w-4 h-4")} />
              </button>
            </>
          )}

          {view === "style" && (
            <div className="flex flex-col gap-5">
              <div className="flex items-center justify-center min-h-[5.5rem] rounded-[14px] screentone [background-size:12px_12px] bg-zinc-950 border border-white/10">
                <SubtitleText styles={props.subtitleStyles}>Así se verán los subtítulos</SubtitleText>
              </div>
              {(
                [
                  ["Tipo de letra", FONT_OPTIONS.map((o) => chip(o.value, o.label, (props.subtitleStyles.fontFamily || "sans") === o.value, () => setStyle({ fontFamily: o.value })))],
                  ["Tamaño", SIZE_OPTIONS.map((o) => chip(o.value, o.label, props.subtitleStyles.fontSize === o.value, () => setStyle({ fontSize: o.value })))],
                  [
                    "Color",
                    COLOR_OPTIONS.map((o) =>
                      chip(o.value, "", props.subtitleStyles.color === o.value, () => setStyle({ color: o.value }), {
                        backgroundImage: `radial-gradient(circle, ${o.value} 0 7px, transparent 8px)`,
                      })
                    ),
                  ],
                  ["Fondo", BACKGROUND_OPTIONS.map((o) => chip(o.value, o.label, props.subtitleStyles.background === o.value, () => setStyle({ background: o.value })))],
                  ["Contorno", OUTLINE_OPTIONS.map((o) => chip(o.value, o.label, (props.subtitleStyles.outline || "thick") === o.value, () => setStyle({ outline: o.value, shadow: true })))],
                ] as const
              ).map(([label, chips]) => (
                <div key={label} className="flex flex-col gap-2">
                  <span className={cn("font-semibold text-zinc-400", tv ? "text-lg" : "text-xs uppercase tracking-wider")}>{label}</span>
                  <div className="flex gap-1.5">{chips}</div>
                </div>
              ))}
            </div>
          )}

          {view === "quality" && (
            <div className="flex flex-col rounded-[14px] bg-ink-3 overflow-hidden shrink-0">
              {option("auto", "Automática", props.quality === -1, () => props.onQualityChange(-1), qualityLabel(props.qualities, -1).replace("Auto", "").replace(" · ", "") || undefined)}
              {[...props.qualities]
                .sort((a, b) => b.height - a.height)
                .map((q) => option(q.index, q.name, props.quality === q.index, () => props.onQualityChange(q.index)))}
            </div>
          )}

          {view === "speed" && (
            <div className="flex flex-col rounded-[14px] bg-ink-3 overflow-hidden shrink-0">
              {SPEEDS.map((s) => option(s, speedLabel(s), Math.abs(props.speed - s) < 0.01, () => props.onSpeedChange(s)))}
            </div>
          )}

          {view === "boost" && (
            <>
              <p className={cn("text-zinc-400", tv ? "text-lg" : "text-sm")}>
                Sube el volumen por encima del máximo del sistema, para episodios con el audio muy bajo.
              </p>
              <div className="flex flex-col rounded-[14px] bg-ink-3 overflow-hidden shrink-0">
                {BOOSTS.map((b) => option(b, `${Math.round(b * 100)} %`, Math.abs(props.boost - b) < 0.01, () => props.onBoostChange(b)))}
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
