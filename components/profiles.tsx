"use client";

import { useEffect, useState } from "react";
import { setFocus } from "@noriginmedia/norigin-spatial-navigation";
import { Check, Delete, Palette, Pencil, Plus, Space, Trash2 } from "lucide-react";
import { authClient } from "@/lib/auth-client";
import { useAccount, type Account } from "@/lib/library/account";
import {
  accountSignature,
  activeProfile,
  addProfile,
  getProfiles,
  markProfilePicked,
  MAX_PROFILES,
  profilePicked,
  PROFILE_COLORS,
  removeProfile,
  setActiveProfile,
  updateProfile,
  useProfiles,
  type Profile,
} from "@/lib/library/profiles";
import { FocusButton, FocusGroup, Screen, useTvFocusable } from "@/components/tv/focusable";
import { useIsTv } from "@/components/ui-mode";
import { cn } from "@/lib/utils";

const NAME_MAX = 16;
const KEYS = "abcdefghijklmnñopqrstuvwxyz1234567890".split("");

export function ProfileAvatar({ profile, className }: { profile: Profile; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn("inline-flex items-center justify-center flex-shrink-0 rounded-full font-black text-black", className)}
      style={{ backgroundColor: profile.color }}
    >
      {profile.name.trim().charAt(0).toUpperCase() || "?"}
    </span>
  );
}

/**
 * Moves to another profile and reloads. A signed-in list account that isn't the one this profile
 * used is signed out first, so nobody edits someone else's list.
 */
export async function switchProfile(id: string, account: Account | null) {
  const target = getProfiles().profiles.find((p) => p.id === id);
  if (!target) return;
  const current = account?.signedIn ? accountSignature(account) : null;
  if (current && target.account !== current) await authClient.signOut().catch(() => {});
  setActiveProfile(id);
  markProfilePicked();
  window.location.reload();
}

/** Remembers which list account the active profile uses, to sign it out when someone else switches in */
function useAccountForProfile() {
  const account = useAccount();
  const signature = account?.signedIn ? accountSignature(account) : null;
  useEffect(() => {
    if (!signature) return;
    const profile = activeProfile();
    if (profile.account !== signature) updateProfile(profile.id, { account: signature });
  }, [signature]);
}

/** Renames with the remote: letters on screen on TV, the device keyboard on the web */
function NameEditor({ profile, onDone }: { profile: Profile; onDone: () => void }) {
  const isTv = useIsTv();
  const [name, setName] = useState(profile.name);
  const save = () => {
    const clean = name.trim().slice(0, NAME_MAX);
    if (clean) updateProfile(profile.id, { name: clean });
    onDone();
  };

  useEffect(() => {
    if (isTv) setFocus("profile-key:a");
  }, [isTv]);

  if (!isTv) {
    return (
      <form
        className="flex flex-wrap items-center gap-2 mt-4"
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        <label htmlFor="profile-name" className="sr-only">
          Nombre del perfil
        </label>
        <input
          id="profile-name"
          autoFocus
          value={name}
          maxLength={NAME_MAX}
          onChange={(e) => setName(e.target.value)}
          className="h-11 px-4 rounded-full bg-ink-3 border-[1.5px] border-line text-white outline-none focus:border-white"
        />
        <button type="submit" className="h-11 px-5 rounded-full bg-red-500 text-black font-bold hover:bg-red-400">
          Guardar
        </button>
        <button type="button" onClick={onDone} className="h-11 px-4 rounded-full text-zinc-400 hover:text-white">
          Cancelar
        </button>
      </form>
    );
  }

  const type = (key: string) => setName((n) => (n.length < NAME_MAX ? (n ? n + key : key.toUpperCase()) : n));
  return (
    <div className="mt-6 max-w-[44rem]">
      <p className="h-16 flex items-center px-6 rounded-xl bg-zinc-900 border-2 border-zinc-700 text-3xl font-bold">
        {name}
        <span className="ml-1 w-[3px] h-9 bg-red-500" />
      </p>
      <FocusGroup className="grid grid-cols-3 gap-2 mt-4">
        <FocusButton variant="chip" className="w-full h-14 rounded-lg" onSelect={() => type(" ")}>
          <Space className="w-6 h-6 mr-2" /> Espacio
        </FocusButton>
        <FocusButton variant="chip" className="w-full h-14 rounded-lg" onSelect={() => setName((n) => n.slice(0, -1))}>
          <Delete className="w-6 h-6 mr-2" /> Borrar
        </FocusButton>
        <FocusButton variant="primary" className="w-full h-14 rounded-lg" onSelect={save}>
          <Check className="w-6 h-6 mr-2" /> Listo
        </FocusButton>
      </FocusGroup>
      <FocusGroup className="grid grid-cols-8 gap-2 mt-2">
        {KEYS.map((key) => (
          <FocusButton
            key={key}
            focusKey={`profile-key:${key}`}
            variant="chip"
            className="w-full h-14 px-0 rounded-lg text-2xl uppercase"
            onSelect={() => type(key)}
          >
            {key}
          </FocusButton>
        ))}
      </FocusGroup>
    </div>
  );
}

/** "Perfiles" in Cuenta: switch, add, rename, recolor or remove */
export function ProfilesSection({ onReveal }: { onReveal?: (node: HTMLElement) => void }) {
  const isTv = useIsTv();
  const account = useAccount();
  const { profiles, active } = useProfiles();
  const current = profiles.find((p) => p.id === active) ?? profiles[0];
  const [renaming, setRenaming] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);

  const recolor = () => {
    const next = PROFILE_COLORS[(PROFILE_COLORS.indexOf(current.color) + 1) % PROFILE_COLORS.length];
    updateProfile(current.id, { color: next });
  };

  return (
    <div>
      <p className="max-w-[60rem] text-base text-zinc-400 tv:text-2xl">
        Cada perfil tiene su propia Mi lista, su historial y sus ajustes de reproducción en este dispositivo. Al cambiar
        a un perfil que no es el de la cuenta con la que has iniciado sesión, se cierra la sesión.
      </p>
      <FocusGroup className="flex flex-wrap mt-6 tv:mt-8" onFocusInside={onReveal}>
        {profiles.map((profile) => (
          <FocusButton
            key={profile.id}
            variant="secondary"
            active={profile.id === active}
            className="mr-4 mb-4 !pl-2"
            onSelect={() => profile.id !== active && switchProfile(profile.id, account)}
          >
            <ProfileAvatar profile={profile} className="w-9 h-9 mr-3 text-lg tv:w-11 tv:h-11 tv:text-xl" />
            {profile.name}
            {profile.id === active && <Check className="w-5 h-5 ml-3" aria-label="Activo" />}
          </FocusButton>
        ))}
        {profiles.length < MAX_PROFILES && (
          <FocusButton variant="secondary" className="mr-4 mb-4" onSelect={() => addProfile()}>
            <Plus className="w-5 h-5 mr-2 tv:w-6 tv:h-6" /> Añadir perfil
          </FocusButton>
        )}
      </FocusGroup>

      <p className="mt-4 text-base text-zinc-500 tv:mt-6 tv:text-xl">Perfil activo: {current.name}</p>
      <FocusGroup className="flex flex-wrap mt-3" onFocusInside={onReveal}>
        <FocusButton variant="chip" className="mr-3 mb-3" active={renaming} onSelect={() => setRenaming((r) => !r)}>
          <Pencil className="w-4 h-4 mr-2 tv:w-5 tv:h-5" /> Cambiar nombre
        </FocusButton>
        <FocusButton variant="chip" className="mr-3 mb-3" onSelect={recolor}>
          <Palette className="w-4 h-4 mr-2 tv:w-5 tv:h-5" /> Cambiar color
        </FocusButton>
        {current.id !== "main" && (
          <FocusButton
            variant="chip"
            className="mr-3 mb-3"
            onSelect={() => {
              if (!confirmRemove) return setConfirmRemove(true);
              removeProfile(current.id);
              window.location.reload();
            }}
          >
            <Trash2 className="w-4 h-4 mr-2 tv:w-5 tv:h-5" />
            {confirmRemove ? "Pulsa otra vez: se borra su lista e historial" : "Eliminar perfil"}
          </FocusButton>
        )}
      </FocusGroup>
      {renaming && <NameEditor key={current.id} profile={current} onDone={() => setRenaming(false)} />}
    </div>
  );
}

/** "¿Quién está viendo?", once per session when the device has several profiles */
function ProfilePicker({ onPicked }: { onPicked: () => void }) {
  const isTv = useIsTv();
  const account = useAccount();
  const { profiles, active } = useProfiles();

  useEffect(() => {
    if (isTv) setFocus(`profile-pick:${active}`);
  }, [isTv, active]);

  const pick = (id: string) => {
    if (id === active) {
      markProfilePicked();
      onPicked();
    } else switchProfile(id, account);
  };

  return (
    <Screen className="flex flex-col items-center justify-center min-h-screen px-6 text-center">
      <h1 className="text-3xl font-black md:text-5xl tv:text-6xl">¿Quién está viendo?</h1>
      <FocusGroup className="flex flex-wrap justify-center mt-10 tv:mt-16" preferredChildFocusKey={`profile-pick:${active}`}>
        {profiles.map((profile) => (
          <PickTile key={profile.id} profile={profile} onSelect={() => pick(profile.id)} />
        ))}
      </FocusGroup>
    </Screen>
  );
}

function PickTile({ profile, onSelect }: { profile: Profile; onSelect: () => void }) {
  return useIsTv() ? (
    <TvPickTile profile={profile} onSelect={onSelect} />
  ) : (
    <button
      type="button"
      onClick={onSelect}
      className="group flex flex-col items-center mx-3 mb-6 rounded-3xl p-3 outline-none focus-visible:koma-sm"
    >
      <ProfileAvatar
        profile={profile}
        className="w-24 h-24 text-4xl md:w-32 md:h-32 md:text-5xl transition-transform group-hover:scale-105"
      />
      <span className="mt-3 text-lg text-zinc-300 group-hover:text-white">{profile.name}</span>
    </button>
  );
}

/** Big avatar over the name; focus lifts it with the koma pop */
function TvPickTile({ profile, onSelect }: { profile: Profile; onSelect: () => void }) {
  const { ref, focused, pointerProps } = useTvFocusable({ focusKey: `profile-pick:${profile.id}`, onSelect });
  return (
    <div ref={ref} {...pointerProps} className="flex flex-col items-center mx-6 mb-6 cursor-pointer outline-none">
      <span className={cn("rounded-full transition-transform duration-150", focused && "koma -translate-x-1 -translate-y-1")}>
        <ProfileAvatar profile={profile} className="w-40 h-40 text-6xl" />
      </span>
      <span className={cn("mt-5 text-3xl font-bold", focused ? "text-white" : "text-zinc-400")}>{profile.name}</span>
    </div>
  );
}

/**
 * Wraps the library: asks who's watching once per session when there are several profiles, and
 * keeps track of which list account each profile uses
 */
export function ProfileGate({ children }: { children: React.ReactNode }) {
  useAccountForProfile();
  const [asking, setAsking] = useState(false);
  useEffect(() => {
    if (getProfiles().profiles.length > 1 && !profilePicked()) setAsking(true);
  }, []);
  if (asking) return <ProfilePicker onPicked={() => setAsking(false)} />;
  return <>{children}</>;
}
