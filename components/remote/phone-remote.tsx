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
  Upload,
  Users,
} from "lucide-react";
import type { RemoteCommand } from "@/lib/pairing/store";
import type { CatalogItem } from "@/lib/anilist/types";
import { metaLine } from "@/lib/library/format";
import { authClient } from "@/lib/auth-client";
import { useAccount } from "@/lib/library/account";
import { collectProfile } from "@/lib/library/profile-transfer";
import { cn } from "@/lib/utils";

const TOKEN_KEY = "pk_remote_token";
const TEXT_DELAY_MS = 300;
const MAX_RESULTS = 8;
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
  // The same search the TV runs, listed here too so a result opens on the TV with one tap
  const [results, setResults] = useState<CatalogItem[]>([]);
  const [opened, setOpened] = useState<number | null>(null);
  const searchSeq = useRef(0);
  const account = useAccount();

  const claim = async (code: string) => {
    setMessage(null);
    const { data } = await postJSON("/api/pair/claim", { code }).catch(() => ({ status: 0, data: {} }));
    if (!data.success) {
      // Only a code the server doesn't know is the code's fault
      setMessage(
        data.code === "INVALID_CODE"
          ? "El código no es válido o ha caducado. Genera otro en la TV."
          : "No se pudo vincular. Abre esta página con la misma dirección que usa la TV y vuelve a intentarlo."
      );
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

  const search = async (value: string) => {
    const seq = ++searchSeq.current;
    const query = value.trim();
    if (query.length < 2) return setResults([]);
    const data = await fetch(`/api/catalog/row?kind=search&value=${encodeURIComponent(query.slice(0, 60))}`)
      .then((res) => res.json())
      .catch(() => null);
    // A later keystroke already asked for something else
    if (seq !== searchSeq.current) return;
    setResults(data?.success ? data.row.items.slice(0, MAX_RESULTS) : []);
  };

  const onText = (value: string) => {
    setText(value);
    setOpened(null);
    clearTimeout(textTimer.current);
    textTimer.current = setTimeout(() => {
      send({ kind: "text", text: value });
      search(value);
    }, TEXT_DELAY_MS);
  };

  const openOnTv = (item: CatalogItem) => {
    setOpened(item.id);
    send({ kind: "navigate", href: `/anime/${item.id}` });
  };

  const [partyCode, setPartyCode] = useState("");
  const [sending, setSending] = useState(false);
  const [profileMessage, setProfileMessage] = useState<string | null>(null);
  const sendProfile = async () => {
    if (!token || sending) return;
    setSending(true);
    setProfileMessage(null);
    const profile = collectProfile();
    const { status, data } = await postJSON("/api/pair/profile", { token, profile }).catch(() => ({ status: 0, data: {} }));
    setSending(false);
    if (status === 404) {
      writeToken(null);
      setPhase("unlinked");
    } else if (data.success) {
      setProfileMessage(
        data.delivered
          ? `Enviado: ${profile.entries.length} animes. Elige en la TV qué hacer con ellos.`
          : "Enviado, pero la TV no responde. Abre la biblioteca en la TV para recibirlo."
      );
    } else {
      setProfileMessage("No se pudo enviar. Vuelve a intentarlo.");
    }
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
            className="flex-1 min-w-0 h-12 px-4 rounded-xl bg-white/10 text-xl tracking-[0.2em] outline-none focus:bg-white/15"
          />
          <button type="submit" className="flex-shrink-0 h-12 px-5 rounded-xl bg-white text-black font-bold">
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
      {results.length > 0 && (
        <ul className="mt-3 flex flex-col gap-2" aria-label="Resultados">
          {results.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                onClick={() => openOnTv(item)}
                className="flex items-center w-full p-2 rounded-xl bg-white/5 text-left active:bg-white/20"
              >
                <span className="flex-shrink-0 w-11 h-16 rounded-md overflow-hidden bg-white/10">
                  {item.cover && <img src={item.cover} alt="" loading="lazy" className="w-full h-full object-cover" />}
                </span>
                <span className="flex flex-col min-w-0 ml-3">
                  <span className="font-bold line-clamp-2">{item.title}</span>
                  <span className="text-sm text-zinc-400 line-clamp-1">
                    {opened === item.id ? "Abierto en la TV" : metaLine(item)}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      <section className="mt-10 pt-6 border-t border-white/10">
        <h2 className="text-sm font-bold uppercase tracking-widest text-zinc-500">Ver juntos en la TV</h2>
        <p className="mt-3 text-zinc-400">
          Crea una sala en la TV (la TV elige qué ver y muestra el código para los demás), o mete la TV en la sala de
          otro con su código.
        </p>
        <div className="flex flex-wrap gap-3 mt-4">
          <button
            type="button"
            onClick={() => send({ kind: "party", action: "create" })}
            className="flex items-center h-11 px-4 rounded-xl bg-white text-black font-bold"
          >
            <Users className="w-5 h-5 mr-2" /> Crear sala en la TV
          </button>
          <button
            type="button"
            onClick={() => send({ kind: "party", action: "leave" })}
            className="flex items-center h-11 px-4 rounded-xl bg-white/10"
          >
            <LogOut className="w-5 h-5 mr-2" /> Sacar la TV de la sala
          </button>
        </div>
        <form
          className="flex gap-2 mt-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (partyCode.length === 6) send({ kind: "party", action: "join", code: partyCode });
          }}
        >
          <label htmlFor="remote-party-code" className="sr-only">
            Código de la sala
          </label>
          <input
            id="remote-party-code"
            value={partyCode}
            autoComplete="off"
            autoCapitalize="characters"
            maxLength={6}
            onChange={(e) => setPartyCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6))}
            placeholder="Código"
            className="flex-1 min-w-0 h-11 px-4 rounded-xl bg-white/10 tracking-[0.2em] text-lg outline-none focus:bg-white/15"
          />
          <button type="submit" disabled={partyCode.length !== 6} className="h-11 px-4 rounded-xl bg-white/10 font-bold disabled:opacity-50">
            Unir la TV
          </button>
        </form>
      </section>

      <section className="mt-10 pt-6 border-t border-white/10">
        <h2 className="text-sm font-bold uppercase tracking-widest text-zinc-500">Tu lista</h2>
        <p className="mt-3 text-zinc-400">
          Envía a la TV la Mi lista, el historial y lo que llevas visto en este móvil, sin cuenta de MyAnimeList ni
          AniList. En la TV eliges si crear un perfil con ello o unirlo al suyo.
        </p>
        <button
          type="button"
          onClick={sendProfile}
          disabled={sending}
          className="flex items-center mt-4 h-11 px-4 rounded-xl bg-white text-black font-bold disabled:opacity-60"
        >
          <Upload className="w-5 h-5 mr-2" /> {sending ? "Enviando…" : "Enviar mi lista a la TV"}
        </button>
        {profileMessage && <p className="mt-3 text-emerald-300">{profileMessage}</p>}
      </section>

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
