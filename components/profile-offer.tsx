"use client";

import { useEffect, useRef, useState } from "react";
import { FocusContext, getCurrentFocusKey, setFocus, useFocusable } from "@noriginmedia/norigin-spatial-navigation";
import { Smartphone } from "lucide-react";
import { useAccount } from "@/lib/library/account";
import { activeProfile, getProfiles, MAX_PROFILES } from "@/lib/library/profiles";
import { createProfileFrom, mergeIntoActive, type ProfileTransfer } from "@/lib/library/profile-transfer";
import { FocusButton } from "@/components/tv/focusable";
import { useBackHandler } from "@/components/tv/navigation-provider";
import { switchProfile } from "@/components/profiles";
import { useIsTv } from "@/components/ui-mode";

export interface ProfileOffer {
  name: string;
  entries: number;
  history: number;
}

/**
 * Asked when the linked phone sends its profile: make a new profile of it, merge it into the
 * active one, or leave it. On TV the remote stays inside the dialog until it closes.
 */
export function ProfileOfferDialog({
  offer,
  take,
  onClose,
}: {
  offer: ProfileOffer;
  /** Fetches the profile the phone sent (only once) */
  take: () => Promise<ProfileTransfer | null>;
  onClose: (message?: string) => void;
}) {
  const isTv = useIsTv();
  const account = useAccount();
  const [busy, setBusy] = useState(false);
  const roomForOne = getProfiles().profiles.length < MAX_PROFILES;
  const current = activeProfile().name;
  const { ref, focusKey } = useFocusable({ isFocusBoundary: true, trackChildren: true });
  const previousFocus = useRef<string | null>(null);

  useEffect(() => {
    if (!isTv) return;
    previousFocus.current = getCurrentFocusKey();
    setFocus("profile-offer:first");
    return () => {
      if (previousFocus.current) setFocus(previousFocus.current);
    };
  }, [isTv]);

  useBackHandler(() => {
    onClose();
    return true;
  });

  const run = async (apply: (data: ProfileTransfer) => void) => {
    if (busy) return;
    setBusy(true);
    const data = await take();
    if (!data) return onClose("El móvil ya no tiene ese perfil esperando. Vuelve a enviarlo.");
    apply(data);
  };

  const createNew = () =>
    run((data) => {
      const id = createProfileFrom(data);
      if (!id) return onClose("No caben más perfiles en esta TV.");
      switchProfile(id, account);
    });

  const merge = () =>
    run((data) => {
      const added = mergeIntoActive(data);
      onClose(added ? `${added} ${added === 1 ? "anime añadido o actualizado" : "animes añadidos o actualizados"} en ${current}` : `${current} ya lo tenía todo`);
    });

  const what = [
    `${offer.entries} ${offer.entries === 1 ? "anime" : "animes"} en Mi lista`,
    offer.history ? `${offer.history} en el historial` : null,
  ]
    .filter(Boolean)
    .join(" y ");

  return (
    <FocusContext.Provider value={focusKey}>
      <div className="fixed top-0 left-0 z-[85] flex items-center justify-center w-screen h-screen bg-black/80 px-4">
        <div
          ref={ref}
          role="dialog"
          aria-label="Perfil recibido del móvil"
          className="w-full max-w-lg p-6 rounded-2xl bg-zinc-950 border-[1.5px] border-line tv:max-w-[52rem] tv:p-12 tv:rounded-3xl"
        >
          <Smartphone className="w-8 h-8 text-red-500 tv:w-12 tv:h-12" />
          <h2 className="mt-4 text-2xl font-black tv:text-5xl">El móvil te envía su perfil</h2>
          <p className="mt-3 text-zinc-300 tv:mt-5 tv:text-2xl">
            «{offer.name}»: {what}. ¿Qué hacemos con él?
          </p>
          <div className="flex flex-wrap mt-6 tv:mt-10">
            {roomForOne && (
              <FocusButton focusKey="profile-offer:first" variant="primary" className="mr-3 mb-3 tv:mr-4" onSelect={createNew}>
                Crear el perfil «{offer.name}»
              </FocusButton>
            )}
            <FocusButton
              focusKey={roomForOne ? undefined : "profile-offer:first"}
              variant="secondary"
              className="mr-3 mb-3 tv:mr-4"
              onSelect={merge}
            >
              Unir con «{current}»
            </FocusButton>
            <FocusButton variant="secondary" className="mb-3" onSelect={() => onClose()}>
              Ahora no
            </FocusButton>
          </div>
          {busy && <p className="mt-2 text-zinc-400 tv:text-xl">Recibiendo…</p>}
        </div>
      </div>
    </FocusContext.Provider>
  );
}
