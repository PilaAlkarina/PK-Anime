"use client";

import { useEffect, useState } from "react";
import { Crown, Delete, LogOut, Users } from "lucide-react";
import { useParty } from "@/components/party/party-provider";
import { useIsTv } from "@/components/ui-mode";
import { FocusButton, FocusGroup } from "./focusable";
import { PageFrame, useMounted } from "./page-frame";

const CODE_LENGTH = 6;
// The room codes' alphabet: no 0/O or 1/I
const KEYS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789".split("");

/**
 * "Ver juntos": the room this device is in, or create one or join one by code. A link with
 * ?code= joins straight away. On TV the code is typed on screen (the phone remote can do all
 * this too).
 */
export function PartyScreen({ initialCode }: { initialCode?: string }) {
  const mounted = useMounted();
  const isTv = useIsTv();
  const { party, isHost, create, join, leave } = useParty();
  const [code, setCode] = useState((initialCode || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, CODE_LENGTH));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const run = async (action: () => Promise<string | null>) => {
    if (busy) return;
    setBusy(true);
    setError(await action());
    setBusy(false);
  };

  // An invitation link joins without asking
  useEffect(() => {
    if (mounted && initialCode && code.length === CODE_LENGTH && party?.code !== code) run(() => join(code));
  }, [mounted]);

  const type = (key: string) => setCode((c) => (c.length < CODE_LENGTH ? c + key : c));
  const host = party?.members.find((m) => m.host);

  return (
    <PageFrame
      title="Ver juntos"
      subtitle="Un episodio a la vez en varios dispositivos. Quien crea la sala elige qué ver; los demás entran con su código y lo siguen. Antes de empezar, el episodio espera a que todos lo hayan cargado."
      ready={mounted}
    >
      {party ? (
        <div>
          <p className="flex items-center text-lg tv:text-3xl">
            <Users className="w-6 h-6 mr-3 text-red-500 tv:w-9 tv:h-9" />
            Estás en la sala <span className="ml-3 font-display text-3xl tracking-[0.2em] tv:text-5xl">{party.code}</span>
          </p>
          <p className="mt-3 text-zinc-400 tv:text-2xl">
            {party.state.phase === "idle"
              ? isHost
                ? "Abre cualquier episodio y todos lo verán contigo."
                : `Esperando a que ${host?.name ?? "el anfitrión"} elija un episodio.`
              : `Episodio ${party.state.episode} en marcha.`}
          </p>
          <ul className="mt-5 flex flex-col gap-2 tv:mt-8 tv:gap-3 tv:text-2xl">
            {party.members
              .filter((m) => m.connected)
              .map((m) => (
                <li key={m.id} className="flex items-center gap-2 font-bold">
                  {m.name}
                  {m.host && <Crown className="w-4 h-4 text-amber-300 tv:w-6 tv:h-6" aria-label="Anfitrión" />}
                </li>
              ))}
          </ul>
          <FocusGroup className="mt-8">
            <FocusButton variant="secondary" onSelect={leave}>
              <LogOut className="w-5 h-5 mr-2 tv:w-6 tv:h-6 tv:mr-3" /> Salir de la sala
            </FocusButton>
          </FocusGroup>
        </div>
      ) : (
        <>
          <FocusGroup className="flex flex-wrap items-center">
            <FocusButton variant="primary" className="mr-4 mb-3" onSelect={() => run(create)}>
              <Users className="w-5 h-5 mr-2 tv:w-6 tv:h-6 tv:mr-3" /> Crear una sala
            </FocusButton>
          </FocusGroup>

          <h2 className="mt-8 mb-4 text-sm font-bold uppercase tracking-widest text-zinc-500 tv:text-lg">O entra con un código</h2>
          {isTv ? (
            <div className="max-w-[52rem]">
              <p className="font-display text-5xl tracking-[0.3em] tabular-nums">{code.padEnd(CODE_LENGTH, "·")}</p>
              <FocusGroup className="grid grid-cols-8 gap-2 mt-6">
                {KEYS.map((key) => (
                  <FocusButton key={key} variant="chip" className="w-full h-14 px-0 rounded-lg text-2xl" onSelect={() => type(key)}>
                    {key}
                  </FocusButton>
                ))}
              </FocusGroup>
              <FocusGroup className="flex mt-4">
                <FocusButton variant="secondary" className="mr-4" onSelect={() => setCode((c) => c.slice(0, -1))}>
                  <Delete className="w-6 h-6 mr-3" /> Borrar
                </FocusButton>
                <FocusButton variant="primary" onSelect={() => code.length === CODE_LENGTH && run(() => join(code))}>
                  {busy ? "Entrando…" : "Entrar en la sala"}
                </FocusButton>
              </FocusGroup>
            </div>
          ) : (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (code.length === CODE_LENGTH) run(() => join(code));
              }}
              className="flex flex-wrap items-center gap-3"
            >
              <label htmlFor="party-code" className="sr-only">
                Código de la sala
              </label>
              <input
                id="party-code"
                autoComplete="off"
                autoCapitalize="characters"
                value={code}
                maxLength={CODE_LENGTH}
                onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, CODE_LENGTH))}
                placeholder="ABC123"
                className="w-48 h-12 px-4 rounded-xl bg-ink-3 border-[1.5px] border-line font-display text-2xl tracking-[0.25em] text-white outline-none focus:border-zinc-400"
              />
              <button
                type="submit"
                disabled={code.length !== CODE_LENGTH || busy}
                className="h-12 px-6 rounded-full bg-red-500 text-black font-bold hover:bg-red-400 disabled:opacity-50"
              >
                {busy ? "Entrando…" : "Entrar"}
              </button>
            </form>
          )}
        </>
      )}
      {error && <p className="mt-6 text-amber-300 tv:text-2xl">{error}</p>}
    </PageFrame>
  );
}
