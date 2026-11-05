"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Copy, Crown, Loader2, LogOut, Users, X } from "lucide-react";
import type { PartySnapshot } from "@/lib/watch-party/client";
import { useIsTv } from "@/components/ui-mode";
import { cn } from "@/lib/utils";
import { useParty } from "./party-provider";

const CODE_LENGTH = 6;

/** Members the open barrier is still waiting on (connected, on the episode, not answered yet) */
export function waitingOn(party: PartySnapshot) {
  const b = party.state.barrier;
  if (!b) return [];
  const answered = b.position === null ? b.reported : b.ready;
  return party.members.filter((m) => m.connected && !m.away && !answered.includes(m.id));
}

function MemberList({ party, showReady }: { party: PartySnapshot; showReady: boolean }) {
  const ready = party.state.barrier?.ready ?? [];
  return (
    <ul className="flex flex-col gap-1.5 tv:gap-3">
      {party.members
        .filter((m) => m.connected)
        .map((m) => (
          <li key={m.id} className="flex items-center gap-2 tv:gap-3">
            {showReady ? (
              ready.includes(m.id) || !party.state.barrier ? (
                <Check className="w-4 h-4 text-emerald-400 tv:w-7 tv:h-7" aria-label="Listo" />
              ) : (
                <Loader2 className="w-4 h-4 text-zinc-400 animate-spin tv:w-7 tv:h-7" aria-label="Cargando" />
              )
            ) : (
              <span className="w-2 h-2 rounded-full bg-emerald-400 tv:w-3 tv:h-3" />
            )}
            <span className="font-bold">{m.name}</span>
            {m.host && <Crown className="w-4 h-4 text-amber-300 tv:w-6 tv:h-6" aria-label="Anfitrión" />}
          </li>
        ))}
    </ul>
  );
}

function statusLine(party: PartySnapshot, isHost: boolean) {
  const host = party.members.find((m) => m.host)?.name ?? "el anfitrión";
  if (party.state.phase !== "watching") {
    return isHost ? "Abre cualquier episodio: todos lo verán contigo." : `Esperando a que ${host} elija un episodio.`;
  }
  return isHost ? `Episodio ${party.state.episode} en marcha. Abre otro para cambiar.` : `${host} ha elegido el episodio ${party.state.episode}.`;
}

/** Computers and phones: a floating button that opens the room's panel, on every page but the player */
export function PartyFab() {
  const { party } = useParty();
  const [open, setOpen] = useState(false);
  const online = party?.members.filter((m) => m.connected).length ?? 0;
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-label={party ? `Sala ${party.code}, ${online} conectados` : "Ver juntos"}
        className={cn(
          "fixed right-4 bottom-20 z-40 flex items-center gap-2 h-12 rounded-full shadow-hard font-bold md:bottom-6 md:right-6",
          party ? "px-4 bg-white text-black" : "w-12 justify-center bg-red-500 text-black hover:bg-red-400"
        )}
      >
        <Users className="w-5 h-5" />
        {party && (
          <span className="tabular-nums">
            {party.code} · {online}
          </span>
        )}
      </button>
      {open && <PartyPanel onClose={() => setOpen(false)} />}
    </>
  );
}

function PartyPanel({ onClose }: { onClose: () => void }) {
  const { party, isHost, create, join, leave } = useParty();
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const run = async (action: () => Promise<string | null>) => {
    setBusy(true);
    setError(null);
    setError(await action());
    setBusy(false);
  };

  const link = party ? `${window.location.origin}/party?code=${party.code}` : "";
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {}
  };

  return (
    <div
      role="dialog"
      aria-label="Ver juntos"
      className="fixed right-4 bottom-36 z-40 w-[calc(100vw-2rem)] max-w-sm p-5 rounded-2xl bg-zinc-950 border-[1.5px] border-line shadow-2xl md:bottom-20 md:right-6"
    >
      <div className="flex items-start justify-between">
        <h2 className="text-lg font-black">Ver juntos</h2>
        <button type="button" onClick={onClose} aria-label="Cerrar" className="-mt-1 -mr-1 p-1.5 rounded-full hover:bg-zinc-800">
          <X className="w-5 h-5" />
        </button>
      </div>

      {party ? (
        <>
          <p className="mt-1 text-sm text-zinc-400">{statusLine(party, isHost)}</p>
          <div className="flex items-center gap-3 mt-4">
            <span className="font-display text-3xl tracking-[0.2em]">{party.code}</span>
            <button
              type="button"
              onClick={copy}
              className="flex items-center gap-1.5 h-9 px-3 rounded-full bg-ink-3 border-[1.5px] border-line text-sm font-bold hover:bg-zinc-800"
            >
              {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
              {copied ? "Copiado" : "Copiar enlace"}
            </button>
          </div>
          <p className="mt-1 text-xs text-zinc-500">Los demás entran con este código en «Ver juntos», o con el enlace.</p>
          <div className="mt-4 text-sm">
            <MemberList party={party} showReady={party.state.barrier?.kind === "pick"} />
          </div>
          <button
            type="button"
            onClick={() => {
              leave();
              onClose();
            }}
            className="flex items-center gap-2 mt-5 h-10 px-4 rounded-full bg-ink-3 border-[1.5px] border-line text-sm font-bold hover:bg-zinc-800"
          >
            <LogOut className="w-4 h-4" /> Salir de la sala
          </button>
        </>
      ) : (
        <>
          <p className="mt-1 text-sm text-zinc-400">
            Mirad un episodio a la vez en varios dispositivos. Quien crea la sala elige qué ver; los demás lo siguen.
          </p>
          <button
            type="button"
            disabled={busy}
            onClick={() => run(create)}
            className="w-full mt-4 h-11 rounded-full bg-red-500 text-black font-bold hover:bg-red-400 disabled:opacity-60"
          >
            Crear una sala
          </button>
          <form
            className="flex gap-2 mt-3"
            onSubmit={(e) => {
              e.preventDefault();
              if (code.length === CODE_LENGTH) run(() => join(code));
            }}
          >
            <label htmlFor="fab-party-code" className="sr-only">
              Código de la sala
            </label>
            <input
              id="fab-party-code"
              value={code}
              autoComplete="off"
              autoCapitalize="characters"
              maxLength={CODE_LENGTH}
              onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, CODE_LENGTH))}
              placeholder="Código"
              className="flex-1 min-w-0 h-11 px-4 rounded-full bg-ink-3 border-[1.5px] border-line font-display tracking-[0.2em] outline-none focus:border-zinc-400"
            />
            <button
              type="submit"
              disabled={busy || code.length !== CODE_LENGTH}
              className="h-11 px-5 rounded-full bg-white text-black font-bold disabled:opacity-50"
            >
              Entrar
            </button>
          </form>
        </>
      )}
      {error && <p className="mt-3 text-sm text-amber-300">{error}</p>}
    </div>
  );
}

/** TV, outside the player: the room in a corner, not focusable (the phone remote manages it) */
export function TvPartyBadge({ party }: { party: PartySnapshot }) {
  const { isHost } = useParty();
  const online = party.members.filter((m) => m.connected).length;
  return (
    <div className="fixed right-[3rem] bottom-[4vh] z-30 max-w-[36rem] px-6 py-4 rounded-2xl bg-zinc-900/95 border border-line text-xl pointer-events-none">
      <p className="flex items-center font-bold">
        <Users className="w-6 h-6 mr-3 text-red-500" /> Sala {party.code} · {online} {online === 1 ? "conectado" : "conectados"}
      </p>
      <p className="mt-1 text-lg text-zinc-400">{statusLine(party, isHost)}</p>
    </div>
  );
}

/** Over the player while watching: the room for a few seconds, then out of the way */
export function WatchPartyBadge({ party }: { party: PartySnapshot }) {
  const [shown, setShown] = useState(true);
  const key = `${party.state.animeId}:${party.state.episode}`;
  useEffect(() => {
    setShown(true);
    const timer = setTimeout(() => setShown(false), 6000);
    return () => clearTimeout(timer);
  }, [key]);
  if (!shown) return null;
  const names = party.members.filter((m) => m.connected).map((m) => m.name);
  return (
    <div className="fixed top-4 left-1/2 z-[60] -translate-x-1/2 px-4 py-2 rounded-full bg-black/80 border border-white/15 text-sm font-bold text-white pointer-events-none tv-fade-in tv:top-[4vh] tv:px-6 tv:py-3 tv:text-xl">
      Viendo juntos · sala {party.code} <span className="font-normal text-zinc-300">({names.join(", ")})</span>
    </div>
  );
}

/**
 * Keys on the TV while the player has spatial navigation paused: ◀ ▶ move between the
 * dialog's buttons, OK presses, Back runs `onBack`. Taken before the player sees them.
 */
function useDialogKeys(count: number, onPress: (index: number) => void, onBack?: () => void) {
  const isTv = useIsTv();
  const [index, setIndex] = useState(0);
  const indexRef = useRef(0);
  indexRef.current = index;
  const pressRef = useRef(onPress);
  pressRef.current = onPress;
  const backRef = useRef(onBack);
  backRef.current = onBack;
  useEffect(() => {
    if (!isTv || count === 0) return;
    const onKey = (e: KeyboardEvent) => {
      const k = e.key;
      const code = e.keyCode;
      let handled = true;
      if (k === "ArrowLeft" || code === 37) setIndex((i) => Math.max(0, i - 1));
      else if (k === "ArrowRight" || code === 39) setIndex((i) => Math.min(count - 1, i + 1));
      else if (k === "Enter" || code === 13) pressRef.current(indexRef.current);
      else if (backRef.current && (k === "Escape" || k === "Backspace" || k === "GoBack" || code === 10009 || code === 461 || code === 27 || code === 8)) backRef.current();
      else if (k === "ArrowUp" || k === "ArrowDown" || code === 38 || code === 40) handled = true;
      else handled = false;
      if (handled) {
        e.preventDefault();
        e.stopImmediatePropagation();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [isTv, count]);
  return isTv ? index : -1;
}

function DialogButton({ selected, primary, onClick, children }: { selected: boolean; primary?: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex items-center h-11 px-5 rounded-full font-bold transition-transform tv:h-16 tv:px-8 tv:text-2xl",
        selected
          ? "bg-white text-black koma"
          : primary
            ? "bg-red-500 text-black hover:bg-red-400"
            : "bg-ink-3 border-[1.5px] border-line hover:bg-zinc-800"
      )}
    >
      {children}
    </button>
  );
}

/** Over the player until everyone has the episode loaded; the host can start without waiting */
export function LobbyOverlay({
  party,
  isHost,
  onStart,
  starting,
}: {
  party: PartySnapshot;
  isHost: boolean;
  onStart: () => void;
  /** Everyone is ready and playback starts in a moment */
  starting: boolean;
}) {
  const online = party.members.filter((m) => m.connected && !m.away);
  const ready = starting ? online.length : online.length - waitingOn(party).length;
  const canStart = isHost && !starting;
  const selected = useDialogKeys(canStart ? 1 : 0, () => onStart());
  return (
    <div className="fixed top-0 left-0 z-[65] flex items-center justify-center w-screen h-screen bg-black/75 px-4">
      <div className="w-full max-w-md p-6 rounded-2xl bg-zinc-950/95 border-[1.5px] border-line text-white tv:max-w-[46rem] tv:p-12 tv:rounded-3xl">
        <p className="text-sm font-bold uppercase tracking-widest text-red-500 tv:text-xl">Ver juntos · sala {party.code}</p>
        <h2 className="mt-2 text-2xl font-black tv:text-5xl">{starting ? "¡Empieza!" : "Esperando a que todos carguen el episodio"}</h2>
        <p className="mt-2 text-zinc-400 tv:mt-4 tv:text-2xl">
          {starting ? "Todos listos." : `${ready} de ${online.length} listos. Empezará a la vez en todos los dispositivos.`}
        </p>
        <div className="mt-5 tv:mt-8 tv:text-2xl">
          <MemberList party={party} showReady />
        </div>
        {canStart && (
          <div className="mt-6 tv:mt-10">
            <DialogButton selected={selected === 0} primary onClick={onStart}>
              Empezar sin esperar
            </DialogButton>
          </div>
        )}
      </div>
    </div>
  );
}

/** A member other than the host opened another episode: leave the room, or go back to it */
export function MismatchDialog({ hostName, onLeave, onBack }: { hostName: string; onLeave: () => void; onBack: () => void }) {
  const actions = [onBack, onLeave];
  const selected = useDialogKeys(2, (i) => actions[i](), onBack);
  return (
    <div className="fixed top-0 left-0 z-[66] flex items-center justify-center w-screen h-screen bg-black/80 px-4">
      <div
        role="alertdialog"
        aria-label="Estás en una sala"
        className="w-full max-w-md p-6 rounded-2xl bg-zinc-950 border-[1.5px] border-line text-white tv:max-w-[52rem] tv:p-12 tv:rounded-3xl"
      >
        <Users className="w-8 h-8 text-red-500 tv:w-12 tv:h-12" />
        <h2 className="mt-3 text-2xl font-black tv:text-5xl">Estás en una sala de «Ver juntos»</h2>
        <p className="mt-2 text-zinc-300 tv:mt-4 tv:text-2xl">
          En la sala elige {hostName}. Para ver este episodio por tu cuenta, sal de la sala.
        </p>
        <div className="flex flex-wrap gap-3 mt-6 tv:gap-5 tv:mt-10">
          <DialogButton selected={selected === 0} onClick={onBack}>
            Volver a la sala
          </DialogButton>
          <DialogButton selected={selected === 1} primary onClick={onLeave}>
            Salir de la sala y ver esto
          </DialogButton>
        </div>
      </div>
    </div>
  );
}

/**
 * Over the player while a barrier holds everyone (a pause, a jump, a resume, a slow buffer):
 * who it's waiting for. Starting, it says so.
 */
export function SyncBadge({ party }: { party: PartySnapshot }) {
  const waiting = waitingOn(party);
  const text = !party.state.barrier
    ? "Sincronizado. ¡Seguimos!"
    : waiting.length
      ? `Sincronizando… esperando a ${waiting.map((m) => m.name).join(", ")}`
      : "Sincronizando…";
  return (
    <div className="fixed top-4 left-1/2 z-[60] -translate-x-1/2 flex items-center gap-2 px-4 py-2 rounded-full bg-black/85 border border-white/15 text-sm font-bold text-white pointer-events-none tv:top-[4vh] tv:gap-3 tv:px-6 tv:py-3 tv:text-xl">
      <Loader2 className="w-4 h-4 animate-spin tv:w-6 tv:h-6" />
      {text}
    </div>
  );
}

export function PartyNotice({ text }: { text: string }) {
  return (
    <div
      role="status"
      className="fixed left-1/2 bottom-24 z-[70] -translate-x-1/2 px-4 py-2.5 rounded-full bg-zinc-900/95 border border-line text-sm font-bold text-white tv-fade-in md:bottom-8 tv:bottom-[10vh] tv:px-6 tv:py-3 tv:text-xl"
    >
      {text}
    </div>
  );
}
