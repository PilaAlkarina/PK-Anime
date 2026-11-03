"use client";

import React from "react";
import { LogOut } from "lucide-react";
import { authClient } from "@/lib/auth-client";

/** Nav control: sign in with MyAnimeList, or show the signed-in MAL user with a sign-out button. */
export function MalAccountButton() {
  const { data: session, isPending } = authClient.useSession();

  if (isPending) return <div className="h-10 w-10" aria-hidden />;

  if (!session) {
    return (
      <button
        type="button"
        onClick={() => authClient.signIn.social({ provider: "myanimelist", callbackURL: window.location.pathname })}
        className="glass h-10 px-4 rounded-full text-[13px] font-semibold text-white cursor-pointer active:scale-95"
      >
        Sign in with MAL
      </button>
    );
  }

  const { name, image } = session.user;
  return (
    <div className="flex items-center gap-1.5">
      <a
        href={`https://myanimelist.net/profile/${encodeURIComponent(name)}`}
        target="_blank"
        rel="noreferrer"
        className="flex items-center gap-2 h-10 pl-1.5 pr-3 rounded-full hover:bg-white/5 transition-colors"
        title="Watched episodes are synced to your MyAnimeList list"
      >
        {image ? (
          <img src={image} alt="" className="w-7 h-7 rounded-full object-cover" />
        ) : (
          <span className="w-7 h-7 rounded-full bg-white/10 flex items-center justify-center text-[12px] font-bold">
            {name.charAt(0).toUpperCase()}
          </span>
        )}
        <span className="hidden sm:inline text-[13px] text-zinc-200 max-w-[120px] truncate">{name}</span>
      </a>
      <button
        type="button"
        onClick={() => authClient.signOut()}
        className="h-10 w-10 rounded-full flex items-center justify-center text-zinc-400 hover:text-white hover:bg-white/5 transition-colors cursor-pointer"
        aria-label="Sign out"
        title="Sign out"
      >
        <LogOut className="w-4 h-4" />
      </button>
    </div>
  );
}
