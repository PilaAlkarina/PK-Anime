"use client";

import { useEffect, useRef, useState } from "react";
import { Smartphone, Tv, Unlink } from "lucide-react";
import { switchUiMode, useLinkCountdown, useTvLink } from "@/components/tv/tv-link";
import { cn } from "@/lib/utils";

/**
 * Linking a phone as the remote, for the PC top bar's dropdown and the player's settings (on
 * both interfaces): the QR and the code to type, then what is linked. Plain buttons, so the
 * player's own arrow navigation reaches them on TV. A code is requested as soon as it opens.
 */
export function RemoteLinkPanel({ tv = false }: { tv?: boolean }) {
  const { available, state, startLinking, unlink } = useTvLink();
  const secondsLeft = useLinkCountdown();
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const opened = useRef(false);

  const requestCode = async () => {
    setFailed(false);
    setLoading(true);
    const ok = await startLinking();
    setLoading(false);
    setFailed(!ok);
  };

  // Once per opening: cancelling leaves the "Vincular" button instead of a new code
  useEffect(() => {
    if (!available || opened.current) return;
    opened.current = true;
    if (state.status === "idle") requestCode();
  }, [available]);

  if (!available) return null;

  const text = tv ? "text-xl" : "text-sm";
  const muted = cn("text-zinc-400", tv ? "text-lg" : "text-[13px]");
  const icon = tv ? "w-6 h-6" : "w-4 h-4";
  const button = (primary: boolean) =>
    cn(
      "flex items-center justify-center gap-2 w-full rounded-xl font-bold outline-none transition-colors",
      tv ? "h-14 text-xl focus:bg-white focus:text-black" : "h-11 text-sm focus-visible:ring-2 focus-visible:ring-white/60",
      primary ? "bg-red-500 text-black hover:bg-red-400" : "bg-ink-3 border-[1.5px] border-line hover:bg-zinc-800"
    );

  if (state.status === "linked") {
    return (
      <div className="flex flex-col gap-3">
        <p className={cn("leading-relaxed text-zinc-300", text)}>
          Hay un móvil vinculado: úsalo como mando y teclado, y para iniciar sesión con tu cuenta.
        </p>
        {!tv && (
          <button type="button" className={button(true)} onClick={() => switchUiMode("tv")}>
            <Tv className={icon} /> Pasar a la interfaz de TV
          </button>
        )}
        <button type="button" className={button(false)} onClick={unlink}>
          <Unlink className={icon} /> Desvincular el móvil
        </button>
      </div>
    );
  }

  if (state.status === "pending" && state.qr) {
    const code = state.code ? `${state.code.slice(0, 3)} ${state.code.slice(3)}` : "";
    return (
      <div className="flex flex-col items-center gap-3 text-center">
        <div
          className={cn("flex-shrink-0 p-2.5 rounded-2xl bg-white [&>svg]:w-full [&>svg]:h-full", tv ? "w-64 h-64" : "w-44 h-44")}
          dangerouslySetInnerHTML={{ __html: state.qr }}
        />
        <p className={cn("text-zinc-300", text)}>Escanea el código con la cámara del móvil.</p>
        <p className={muted}>
          O abre <span className="text-zinc-200 break-all">{state.url?.replace(/\?.*$/, "")}</span> e introduce el código:
        </p>
        <p className={cn("font-bold tracking-[0.2em] tabular-nums", tv ? "text-5xl" : "text-3xl")}>{code}</p>
        <p className={muted}>
          Caduca en {Math.floor(secondsLeft / 60)}:{String(secondsLeft % 60).padStart(2, "0")}
        </p>
        {!tv && <p className={muted}>Al vincularlo, esta pantalla pasa a la interfaz de TV, que es la que se maneja con el mando.</p>}
        <button type="button" className={button(false)} onClick={unlink}>
          Cancelar
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <p className={cn("leading-relaxed text-zinc-300", text)}>
        {loading
          ? "Generando el código…"
          : failed
            ? "No se pudo generar el código. Comprueba la conexión y vuelve a intentarlo."
            : "Vincula tu móvil para usarlo como mando y teclado."}
      </p>
      {!loading && (
        <button type="button" className={button(true)} onClick={requestCode}>
          <Smartphone className={icon} /> {failed ? "Reintentar" : "Vincular un móvil"}
        </button>
      )}
    </div>
  );
}
