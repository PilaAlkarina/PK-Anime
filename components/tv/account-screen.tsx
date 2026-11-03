"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { setFocus } from "@noriginmedia/norigin-spatial-navigation";
import { ChevronRight, LogOut, Settings, Smartphone, Tv, Unlink } from "lucide-react";
import { authClient } from "@/lib/auth-client";
import { refreshAccount, useAccount } from "@/lib/library/account";
import { useIsTv } from "@/components/ui-mode";
import { FocusButton, FocusGroup } from "./focusable";
import { PageFrame, useMounted, useRevealOnFocus } from "./page-frame";
import { ExportLocal } from "./export-local";
import { useTvLink } from "./tv-link";

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="mb-5 pb-2 text-sm font-bold uppercase tracking-widest text-zinc-500 border-b border-white/10 tv:mb-8 tv:pb-3 tv:text-lg">
      {children}
    </h2>
  );
}

function useCountdown(until: number | null) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!until) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [until]);
  return until ? Math.max(0, Math.round((until - now) / 1000)) : 0;
}

function AccountSection() {
  const account = useAccount();
  const isTv = useIsTv();
  const reveal = useRevealOnFocus();

  if (!account) return <p className="text-lg text-zinc-500 tv:text-2xl">Cargando…</p>;

  if (account.signedIn && account.user && account.provider) {
    return (
      <div className="flex flex-wrap items-start gap-5 tv:flex-nowrap tv:gap-0">
        {account.user.image ? (
          <img src={account.user.image} alt="" className="w-16 h-16 rounded-full object-cover tv:w-24 tv:h-24" />
        ) : (
          <span className="flex items-center justify-center w-16 h-16 rounded-full bg-white/10 text-2xl font-bold tv:w-24 tv:h-24 tv:text-4xl">
            {account.user.name.charAt(0).toUpperCase()}
          </span>
        )}
        <div className="flex-1 min-w-[14rem] tv:ml-8">
          <p className="text-xl font-bold tv:text-3xl">{account.user.name}</p>
          <p className="mt-1 text-[0.95rem] text-zinc-400 tv:text-xl">
            {account.provider.name} · el progreso de lo que ves se sincroniza con tu lista
          </p>
          <FocusGroup className="mt-5 tv:mt-6" onFocusInside={(node) => reveal(node)}>
            <FocusButton onSelect={() => authClient.signOut().finally(() => refreshAccount())}>
              <LogOut className="w-5 h-5 mr-2 tv:w-6 tv:h-6 tv:mr-3" /> Cerrar sesión
            </FocusButton>
          </FocusGroup>
          <div className="mt-8 tv:mt-10">
            <ExportLocal />
          </div>
        </div>
      </div>
    );
  }

  if (account.providers.length === 0) {
    return (
      <p className="text-lg text-zinc-400 tv:text-2xl">
        Este servidor no tiene ningún servicio configurado. Añade las credenciales de MyAnimeList en el archivo de
        entorno para activarlo.
      </p>
    );
  }

  const names = account.providers.map((p) => p.name).join(" o ");
  return (
    <>
      <p className="max-w-[60rem] text-base leading-relaxed text-zinc-300 tv:text-2xl">
        Inicia sesión con {names} para sincronizar lo que ves y unir Mi lista con tu lista de pendientes.
      </p>
      {isTv && (
        <p className="mt-3 max-w-[60rem] text-xl text-zinc-500">Es más cómodo desde el móvil: vincúlalo abajo y entra desde allí.</p>
      )}
      <FocusGroup className="flex flex-wrap mt-6 tv:mt-8" onFocusInside={(node) => reveal(node)}>
        {account.providers.map((provider) => (
          <FocusButton
            key={provider.id}
            variant="primary"
            className="mr-4"
            onSelect={() => authClient.signIn.social({ provider: provider.id, callbackURL: "/account" })}
          >
            {isTv ? `Entrar con ${provider.name} en la TV` : `Entrar con ${provider.name}`}
          </FocusButton>
        ))}
      </FocusGroup>
    </>
  );
}

function PhoneSection() {
  const { state, startLinking, unlink } = useTvLink();
  const reveal = useRevealOnFocus();
  const secondsLeft = useCountdown(state.status === "pending" ? state.expiresAt : null);

  // The button that started linking disappears, so focus follows to this section's new one
  useEffect(() => {
    if (state.status === "pending") setFocus("account:cancel-link");
    if (state.status === "linked") setFocus("account:unlink");
  }, [state.status]);

  // A QR that expires is replaced while the screen is open
  useEffect(() => {
    if (state.status === "pending" && state.expiresAt && secondsLeft === 0) startLinking();
  }, [state.status, state.expiresAt, secondsLeft, startLinking]);

  if (state.status === "linked") {
    return (
      <>
        <p className="max-w-[60rem] text-2xl leading-relaxed text-zinc-300">
          Hay un móvil vinculado. Desde él puedes moverte por la biblioteca, controlar el reproductor, escribir en
          la búsqueda e iniciar sesión en la TV con tu cuenta.
        </p>
        <FocusGroup className="mt-8" onFocusInside={(node) => reveal(node)}>
          <FocusButton focusKey="account:unlink" onSelect={unlink}>
            <Unlink className="w-6 h-6 mr-3" /> Desvincular el móvil
          </FocusButton>
        </FocusGroup>
      </>
    );
  }

  if (state.status === "pending" && state.qr) {
    const code = state.code ? `${state.code.slice(0, 3)} ${state.code.slice(3)}` : "";
    return (
      <div className="flex items-start">
        <div
          className="flex-shrink-0 w-[17rem] h-[17rem] p-3 rounded-2xl bg-white [&>svg]:w-full [&>svg]:h-full"
          dangerouslySetInnerHTML={{ __html: state.qr }}
        />
        <div className="ml-10">
          <p className="text-2xl text-zinc-300">Escanea el código con la cámara del móvil.</p>
          <p className="mt-2 text-xl text-zinc-500">
            O abre <span className="text-zinc-300">{state.url?.replace(/\?.*$/, "")}</span> e introduce el código:
          </p>
          <p className="mt-4 text-6xl font-bold tracking-[0.2em]">{code}</p>
          <p className="mt-4 text-lg text-zinc-500">
            Caduca en {Math.floor(secondsLeft / 60)}:{String(secondsLeft % 60).padStart(2, "0")}
          </p>
          <FocusGroup className="mt-6" onFocusInside={(node) => reveal(node)}>
            <FocusButton focusKey="account:cancel-link" onSelect={unlink}>
              Cancelar
            </FocusButton>
          </FocusGroup>
        </div>
      </div>
    );
  }

  return (
    <>
      <p className="max-w-[60rem] text-2xl leading-relaxed text-zinc-300">
        Vincula tu móvil para usarlo como mando y teclado, y para iniciar sesión en la TV sin escribir la contraseña
        con el mando.
      </p>
      <FocusGroup className="mt-8" onFocusInside={(node) => reveal(node)}>
        <FocusButton variant="primary" onSelect={startLinking}>
          <Smartphone className="w-6 h-6 mr-3" /> Vincular un móvil
        </FocusButton>
      </FocusGroup>
    </>
  );
}

/** Web only: Ajustes lives here on phones, and the phone can become the TV's remote */
function WebShortcuts() {
  const links = [
    { href: "/settings", icon: Settings, title: "Ajustes", text: "Audio, idiomas de subtítulos, servidor y formato" },
    { href: "/link", icon: Tv, title: "Usar como mando de la TV", text: "Introduce el código que muestra la TV en Cuenta" },
  ];
  return (
    <div className="flex flex-col gap-2.5 max-w-xl">
      {links.map(({ href, icon: Icon, title, text }) => (
        <Link key={href} href={href} className="flex items-center gap-4 p-4 rounded-2xl bg-zinc-950 border border-zinc-900 hover:bg-zinc-900">
          <Icon className="w-6 h-6 flex-shrink-0 text-zinc-300" aria-hidden />
          <span className="flex flex-col flex-1 min-w-0">
            <span className="font-semibold">{title}</span>
            <span className="text-sm text-zinc-400">{text}</span>
          </span>
          <ChevronRight className="w-5 h-5 text-zinc-500" aria-hidden />
        </Link>
      ))}
    </div>
  );
}

export function AccountScreen() {
  const mounted = useMounted();
  const account = useAccount();
  const isTv = useIsTv();
  return (
    <PageFrame title={isTv ? "Cuenta" : "Perfil"} ready={mounted && account !== null}>
      <section className="mb-12 tv:mb-16">
        <SectionTitle>Sincronización</SectionTitle>
        <AccountSection />
      </section>
      {isTv ? (
        <section>
          <SectionTitle>Móvil</SectionTitle>
          <PhoneSection />
        </section>
      ) : (
        <section>
          <SectionTitle>Más</SectionTitle>
          <WebShortcuts />
        </section>
      )}
    </PageFrame>
  );
}
