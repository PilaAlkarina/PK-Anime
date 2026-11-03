"use client";

import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  FastForward,
  Home,
  LogIn,
  LogOut,
  Play,
  Rewind,
  Search,
  Unlink,
} from "lucide-react";
import type { RemoteCommand } from "@/lib/pairing/store";
import { authClient } from "@/lib/auth-client";
import { useAccount } from "@/lib/library/account";
import { cn } from "@/lib/utils";

const TOKEN_KEY = "pk_remote_token";
const TEXT_DELAY_MS = 300;
const STATUS_POLL_MS = 15_000;

type Phase = "starting" | "enter-code" | "linked" | "unlinked";

function readToken() {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

function writeToken(token: string | null) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {}
}

async function postJSON(url: string, body: unknown) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return { status: res.status, data: await res.json().catch(() => ({})) };
}

function PadButton({
  onPress,
  label,
  className,
  children,
}: {
  onPress: () => void;
  label: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onPress}
      className={cn(
        "flex items-center justify-center rounded-2xl bg-white/10 text-white active:bg-white/30 active:scale-95 transition",
        className
      )}
    >
      {children}
    </button>
  );
}

/** Phone page for a TV link: claims the QR code, then works as remote control and keyboard */
export function PhoneRemote({ code: codeParam }: { code: string | null }) {
  const [phase, setPhase] = useState<Phase>("starting");
  const [token, setToken] = useState<string | null>(null);
  const [codeInput, setCodeInput] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [tvListening, setTvListening] = useState(true);
  const [text, setText] = useState("");
  const textTimer = useRef<ReturnType<typeof setTimeout>>();
  const account = useAccount();

  const claim = async (code: string) => {
    setMessage(null);
    const { data } = await postJSON("/api/pair/claim", { code });
    if (!data.success) {
      setMessage("El código no es válido o ha caducado. Genera otro en la TV.");
      setPhase("enter-code");
      return;
    }
    writeToken(data.token);
    setToken(data.token);
    setPhase("linked");
  };

  useEffect(() => {
    // The code is single-use; drop it from the address so a reload doesn't try it again
    if (codeParam) window.history.replaceState(null, "", "/link");
    const stored = readToken();
    if (codeParam) {
      claim(codeParam);
    } else if (stored) {
      setToken(stored);
      setPhase("linked");
    } else {
      setPhase("enter-code");
    }
  }, [codeParam]);

  // Notices an unlink from the TV (or a server restart) and whether the TV is listening
  useEffect(() => {
    if (phase !== "linked" || !token) return;
    const check = async () => {
      const data = await fetch(`/api/pair/remote?token=${encodeURIComponent(token)}`)
        .then((res) => res.json())
        .catch(() => null);
      if (!data) return;
      if (!data.linked) {
        writeToken(null);
        setPhase("unlinked");
      } else {
        setTvListening(data.tvListening);
      }
    };
    check();
    const timer = setInterval(check, STATUS_POLL_MS);
    return () => clearInterval(timer);
  }, [phase, token]);

  const send = async (command: RemoteCommand) => {
    if (!token) return;
    navigator.vibrate?.(10);
    const { status, data } = await postJSON("/api/pair/remote", { token, command }).catch(() => ({
      status: 0,
      data: {},
    }));
    if (status === 404) {
      writeToken(null);
      setPhase("unlinked");
    } else if (data.success) {
      setTvListening(data.delivered);
    }
  };

  const key = (k: Extract<RemoteCommand, { kind: "key" }>["key"]) => () => send({ kind: "key", key: k });

  const onText = (value: string) => {
    setText(value);
    clearTimeout(textTimer.current);
    textTimer.current = setTimeout(() => send({ kind: "text", text: value }), TEXT_DELAY_MS);
  };

  const signInTv = async () => {
    setMessage(null);
    const { data } = await postJSON("/api/pair/session", { token });
    setMessage(data.success ? "Listo: la TV está iniciando sesión con tu cuenta." : "No se pudo pasar la sesión a la TV.");
  };

  const unlink = async () => {
    await postJSON("/api/pair/unlink", { token }).catch(() => {});
    writeToken(null);
    setToken(null);
    setPhase("enter-code");
  };

  if (phase === "starting") {
    return <p className="text-zinc-400">Conectando…</p>;
  }

  if (phase !== "linked") {
    return (
      <div>
        <h1 className="text-2xl font-bold">Vincular con la TV</h1>
        <p className="mt-2 text-zinc-400">
          {phase === "unlinked"
            ? "La TV ya no está vinculada. Abre Cuenta en la TV para generar otro código."
            : "Escanea el QR que aparece en Cuenta, en la TV, o escribe aquí su código."}
        </p>
        <form
          className="mt-6 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (codeInput.trim()) claim(codeInput);
          }}
        >
          <input
            value={codeInput}
            onChange={(e) => setCodeInput(e.target.value.toUpperCase())}
            placeholder="Código"
            autoCapitalize="characters"
            autoComplete="off"
            maxLength={7}
            className="flex-1 h-12 px-4 rounded-xl bg-white/10 text-xl tracking-[0.2em] outline-none focus:bg-white/15"
          />
          <button type="submit" className="h-12 px-5 rounded-xl bg-white text-black font-bold">
            Vincular
          </button>
        </form>
        {message && <p className="mt-4 text-amber-300">{message}</p>}
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Mando de PK Anime</h1>
        <span className={cn("flex items-center text-sm", tvListening ? "text-emerald-400" : "text-amber-300")}>
          <span className={cn("w-2 h-2 mr-2 rounded-full", tvListening ? "bg-emerald-400" : "bg-amber-300")} />
          {tvListening ? "TV conectada" : "La TV no responde"}
        </span>
      </div>

      <div className="grid grid-cols-3 gap-3 mt-6 mx-auto max-w-xs">
        <span />
        <PadButton label="Arriba" onPress={key("ArrowUp")} className="h-20">
          <ChevronUp className="w-9 h-9" />
        </PadButton>
        <span />
        <PadButton label="Izquierda" onPress={key("ArrowLeft")} className="h-20">
          <ChevronLeft className="w-9 h-9" />
        </PadButton>
        <PadButton label="Aceptar" onPress={key("Enter")} className="h-20 bg-white text-black text-lg font-bold">
          OK
        </PadButton>
        <PadButton label="Derecha" onPress={key("ArrowRight")} className="h-20">
          <ChevronRight className="w-9 h-9" />
        </PadButton>
        <PadButton label="Atrás" onPress={key("Back")} className="h-14">
          <ArrowLeft className="w-6 h-6" />
        </PadButton>
        <PadButton label="Abajo" onPress={key("ArrowDown")} className="h-20">
          <ChevronDown className="w-9 h-9" />
        </PadButton>
        <PadButton label="Inicio" onPress={() => send({ kind: "navigate", href: "/" })} className="h-14">
          <Home className="w-6 h-6" />
        </PadButton>
      </div>

      <div className="grid grid-cols-3 gap-3 mt-6 mx-auto max-w-xs">
        <PadButton label="Retroceder 10 segundos" onPress={key("Rewind")} className="h-14">
          <Rewind className="w-6 h-6" />
        </PadButton>
        <PadButton label="Reproducir o pausar" onPress={key("PlayPause")} className="h-14">
          <Play className="w-6 h-6" fill="currentColor" />
        </PadButton>
        <PadButton label="Avanzar 10 segundos" onPress={key("FastForward")} className="h-14">
          <FastForward className="w-6 h-6" />
        </PadButton>
      </div>

      <label className="flex items-center mt-8 h-12 px-4 rounded-xl bg-white/10 focus-within:bg-white/15">
        <Search className="w-5 h-5 mr-3 text-zinc-400" />
        <input
          value={text}
          onChange={(e) => onText(e.target.value)}
          placeholder="Escribe para buscar en la TV"
          autoComplete="off"
          enterKeyHint="search"
          className="flex-1 bg-transparent outline-none text-lg"
        />
      </label>

      <section className="mt-10 pt-6 border-t border-white/10">
        <h2 className="text-sm font-bold uppercase tracking-widest text-zinc-500">Cuenta</h2>
        {!account ? (
          <p className="mt-3 text-zinc-400">Cargando…</p>
        ) : account.signedIn && account.user ? (
          <>
            <p className="mt-3 text-zinc-300">
              En este móvil: <strong>{account.user.name}</strong> ({account.provider?.name})
            </p>
            <div className="flex flex-wrap gap-3 mt-4">
              <button type="button" onClick={signInTv} className="flex items-center h-11 px-4 rounded-xl bg-white text-black font-bold">
                <LogIn className="w-5 h-5 mr-2" /> Iniciar sesión en la TV
              </button>
              <button
                type="button"
                onClick={() => send({ kind: "signout" })}
                className="flex items-center h-11 px-4 rounded-xl bg-white/10"
              >
                <LogOut className="w-5 h-5 mr-2" /> Cerrar sesión en la TV
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="mt-3 text-zinc-400">
              Inicia sesión aquí y después pásala a la TV, sin escribir la contraseña con el mando.
            </p>
            <div className="flex flex-wrap gap-3 mt-4">
              {account.providers.map((provider) => (
                <button
                  key={provider.id}
                  type="button"
                  onClick={() => authClient.signIn.social({ provider: provider.id, callbackURL: "/link" })}
                  className="flex items-center h-11 px-4 rounded-xl bg-white text-black font-bold"
                >
                  <LogIn className="w-5 h-5 mr-2" /> Entrar con {provider.name}
                </button>
              ))}
            </div>
          </>
        )}
        {message && <p className="mt-4 text-emerald-300">{message}</p>}
      </section>

      <button type="button" onClick={unlink} className="flex items-center mt-10 text-zinc-500">
        <Unlink className="w-4 h-4 mr-2" /> Desvincular este móvil
      </button>
    </div>
  );
}
