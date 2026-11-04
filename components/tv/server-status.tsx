"use client";

import { RefreshCw } from "lucide-react";
import { useServiceStatus, type ServiceState, type ServiceStatus } from "@/lib/use-service-status";
import { FocusButton, FocusGroup } from "./focusable";
import { PageFrame, useRevealOnFocus } from "./page-frame";
import { cn } from "@/lib/utils";

const STATE: Record<ServiceState, { label: string; dot: string; text: string }> = {
  ok: { label: "Funciona", dot: "bg-emerald-400", text: "text-emerald-300" },
  degraded: { label: "Lento", dot: "bg-amber-400", text: "text-amber-300" },
  down: { label: "Caído", dot: "bg-red-500", text: "text-red-300" },
};

const STEP_LABELS: Record<string, string> = {
  play: "al pedir el stream",
  playlist: "en la lista de vídeo",
  variant: "en la lista de calidades",
  segment: "en los segmentos de vídeo",
  request: "al conectar",
};

const time = new Intl.DateTimeFormat("es", { hour: "2-digit", minute: "2-digit" });

function Row({ service }: { service: ServiceStatus }) {
  const state = STATE[service.state];
  return (
    <div className="flex items-start py-3 border-b border-white/5 last:border-0 tv:py-4">
      <span className={cn("flex-shrink-0 w-2.5 h-2.5 mt-1.5 mr-3 rounded-full tv:w-3.5 tv:h-3.5 tv:mt-2 tv:mr-4", state.dot)} />
      <div className="flex-1 min-w-0">
        <div className="flex flex-wrap items-baseline">
          <span className="mr-3 font-semibold tv:text-2xl">{service.name}</span>
          <span className={cn("mr-3 text-sm tv:text-xl", state.text)}>{state.label}</span>
          <span className="text-xs text-zinc-500 tabular-nums tv:text-lg">{(service.ms / 1000).toFixed(1)} s</span>
        </div>
        {service.state !== "ok" && service.detail && (
          <p className="mt-0.5 text-sm text-zinc-400 tv:text-lg">
            {service.step && service.state === "down" ? `Falla ${STEP_LABELS[service.step] || service.step}: ` : ""}
            {service.detail}
          </p>
        )}
      </div>
    </div>
  );
}

/**
 * Live state of the stream servers, AniList and AniSkip (from /api/status), so a video that
 * won't load can be told apart from a server that is down.
 */
export function ServerStatus() {
  const { services, checkedAt, httpFallbackHosts, loading, failed, refresh } = useServiceStatus();
  const reveal = useRevealOnFocus(160);
  const servers = services.filter((s) => s.kind === "server");
  const data = services.filter((s) => s.kind === "data");
  const down = servers.filter((s) => s.state === "down").length;

  return (
    <div>
      <p className="text-sm text-zinc-400 tv:text-xl">
        {loading && services.length === 0
          ? "Comprobando los servidores… tarda unos segundos."
          : failed && services.length === 0
            ? "No se pudo comprobar el estado."
            : `${
                down === 0 ? "Todos los servidores funcionan." : `${down} de ${servers.length} servidores no funcionan ahora.`
              } Comprobado a las ${checkedAt ? time.format(checkedAt) : "—"} con el episodio 1 de Attack on Titan.`}
      </p>

      {services.length > 0 && (
        <div className="max-w-[52rem] mt-4 px-4 rounded-2xl bg-white/5 tv:px-6">
          {[...servers, ...data].map((service) => (
            <Row key={service.id} service={service} />
          ))}
        </div>
      )}

      {httpFallbackHosts.length > 0 && (
        <p className="max-w-[52rem] mt-3 text-xs text-zinc-500 tv:text-base">
          {httpFallbackHosts.length === 1 ? "Un servidor de vídeo rechaza" : `${httpFallbackHosts.length} servidores de vídeo rechazan`}{" "}
          conexiones seguras; se descargan por HTTP desde este servidor ({httpFallbackHosts.join(", ")}).
        </p>
      )}

      <FocusGroup className="mt-5 tv:mt-6" onFocusInside={(node) => reveal(node)}>
        <FocusButton onSelect={refresh}>
          <RefreshCw className={cn("w-4 h-4 mr-2 tv:w-6 tv:h-6 tv:mr-3", loading && "animate-spin")} />
          {loading ? "Comprobando…" : "Comprobar ahora"}
        </FocusButton>
      </FocusGroup>
    </div>
  );
}

/** The status page (/status): reachable from the TV rail, the top bar and Perfil */
export function StatusScreen() {
  return (
    <PageFrame
      title="Estado de los servidores"
      subtitle="Si un vídeo no carga, aquí ves si es cosa del servidor. Cada uno se prueba igual que lo usa el reproductor."
    >
      <ServerStatus />
    </PageFrame>
  );
}
