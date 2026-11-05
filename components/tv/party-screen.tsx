"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Delete, Users } from "lucide-react";
import { useAccount } from "@/lib/library/account";
import { deviceName, joinPartyByCode, watchHref } from "@/lib/watch-party/client";
import { useIsTv } from "@/components/ui-mode";
import { FocusButton, FocusGroup } from "./focusable";
import { PageFrame, useMounted } from "./page-frame";

const CODE_LENGTH = 6;
// The room codes' alphabet: no 0/O or 1/I
const KEYS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789".split("");

/** "Ver juntos": type the code another device shows and join its room, on its episode */
export function PartyScreen({ initialCode }: { initialCode?: string }) {
  const mounted = useMounted();
  const isTv = useIsTv();
  const router = useRouter();
  const account = useAccount();
  const [code, setCode] = useState((initialCode || "").toUpperCase().slice(0, CODE_LENGTH));
  const [error, setError] = useState<string | null>(null);
  const [joining, setJoining] = useState(false);

  const join = async () => {
    if (code.length !== CODE_LENGTH || joining) return;
    setJoining(true);
    setError(null);
    const result = await joinPartyByCode(code, deviceName(account?.user?.name, isTv));
    setJoining(false);
    if ("error" in result) return setError(result.error);
    router.replace(watchHref(result.state, result.code));
  };

  const type = (key: string) => setCode((c) => (c.length < CODE_LENGTH ? c + key : c));

  return (
    <PageFrame
      title="Ver juntos"
      subtitle="Escribe el código que aparece arriba en el reproductor del otro dispositivo. Pausas, saltos y episodios se reproducen a la vez en todos."
      ready={mounted}
    >
      <div className="flex items-center">
        <Users className="w-7 h-7 mr-4 text-red-500 tv:w-10 tv:h-10" />
        {isTv ? (
          <p className="font-display text-5xl tracking-[0.3em] tabular-nums">
            {code.padEnd(CODE_LENGTH, "·")}
          </p>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              join();
            }}
            className="flex flex-wrap items-center gap-3"
          >
            <label htmlFor="party-code" className="sr-only">
              Código de la sala
            </label>
            <input
              id="party-code"
              autoFocus
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
              disabled={code.length !== CODE_LENGTH || joining}
              className="h-12 px-6 rounded-full bg-red-500 text-black font-bold hover:bg-red-400 disabled:opacity-50"
            >
              {joining ? "Entrando…" : "Entrar"}
            </button>
          </form>
        )}
      </div>

      {isTv && (
        <div className="mt-8 max-w-[52rem]">
          <FocusGroup className="grid grid-cols-8 gap-2">
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
            <FocusButton variant="primary" onSelect={join}>
              {joining ? "Entrando…" : "Entrar en la sala"}
            </FocusButton>
          </FocusGroup>
        </div>
      )}

      {error && <p className="mt-6 text-amber-300 tv:text-2xl">{error}</p>}
      <p className="mt-8 max-w-[60rem] text-sm text-zinc-500 tv:text-xl">
        Para crear una sala, abre la ficha de un anime y elige «Ver juntos». Los dispositivos deben usar este mismo
        servidor.
      </p>
    </PageFrame>
  );
}
