"use client";

import { useEffect, useState } from "react";
import { pause, resume } from "@noriginmedia/norigin-spatial-navigation";
import type { AnimeDetail } from "@/lib/anilist/types";
import { recordWatch } from "@/lib/library/history";
import { getAudioPreference, type AudioPreference } from "@/lib/library/preferences";
import { getPlaybackPreferences } from "@/lib/playback-preferences";
import { EmbedPlayer } from "@/components/player/embed-player";
import { useBackHandler, useLibraryNavigation } from "./navigation-provider";
import { useIsTv } from "@/components/ui-mode";
import { ChevronLeft } from "lucide-react";

const NEXT_EPISODE_COUNTDOWN = 8;

/**
 * Full-screen player. Spatial navigation is paused here: arrows seek and change volume,
 * Enter plays or pauses, Back returns to the anime.
 */
export function WatchScreen({
  anime,
  episode,
  audio: audioParam,
}: {
  anime: AnimeDetail;
  episode: number;
  audio?: AudioPreference;
}) {
  const { replace, goBack } = useLibraryNavigation();
  const isTv = useIsTv();
  // The player only runs in the browser; mounting it after hydration also lets the
  // stored Sub/Dub preference apply without a server/client mismatch
  const [audio, setAudio] = useState<AudioPreference | null>(null);
  const [nextIn, setNextIn] = useState<number | null>(null);

  const total = anime.availableEpisodes ?? anime.episodes ?? 0;
  const hasNext = episode < total;
  const effectiveAudio = audio ?? "sub";
  // Read only once the player mounts (after hydration), like the audio preference
  const preferredServer = audio ? getPlaybackPreferences().preferredServer : "auto";

  useEffect(() => {
    setAudio(audioParam ?? getAudioPreference());
  }, [audioParam]);

  // Spatial navigation only runs in the TV layout
  useEffect(() => {
    if (!isTv) return;
    pause();
    return () => resume();
  }, [isTv]);

  useEffect(() => {
    recordWatch(anime, episode);
  }, [anime, episode]);

  useEffect(() => {
    if (nextIn === null) return;
    if (nextIn <= 0) {
      // Replace, so Back from the next episode still returns to the anime page
      replace(`/watch/${anime.id}/${episode + 1}?audio=${effectiveAudio}`);
      return;
    }
    const timer = setTimeout(() => setNextIn((n) => (n === null ? null : n - 1)), 1000);
    return () => clearTimeout(timer);
  }, [nextIn, replace, anime.id, episode, effectiveAudio]);

  // Back cancels the countdown before it leaves the player
  useBackHandler(
    nextIn !== null
      ? () => {
          setNextIn(null);
          return true;
        }
      : null
  );

  const onPlayerEvent = (name: string) => {
    if (name === "ended" && hasNext) setNextIn(NEXT_EPISODE_COUNTDOWN);
  };

  return (
    <div className="fixed top-0 left-0 z-50 w-screen h-screen bg-black">
      {audio && (
        <EmbedPlayer
          anilistId={anime.id}
          malId={anime.malId}
          episodeNumber={episode}
          initialAudio={audio}
          // Starting on the preferred server saves a reload; the player still moves to another
          // one when only that one has the wanted subtitle language
          initialServer={preferredServer === "auto" ? "flow" : preferredServer}
          title={anime.title}
          onPlayerEvent={onPlayerEvent}
        />
      )}
      {/* Without a remote's Back key, the web layout needs a way out */}
      {!isTv && (
        <button
          type="button"
          onClick={goBack}
          aria-label="Volver a la ficha"
          className="absolute top-3 left-3 z-[60] flex items-center justify-center w-11 h-11 rounded-full bg-black/60 text-white hover:bg-black/80"
        >
          <ChevronLeft className="w-6 h-6" />
        </button>
      )}
      {nextIn !== null && (
        <div className="absolute right-4 bottom-24 z-[60] w-[min(26rem,calc(100vw-2rem))] p-5 rounded-2xl bg-zinc-900/95 tv:right-[5vw] tv:bottom-[14vh] tv:p-6 tv-fade-in">
          <p className="text-sm text-zinc-400 tv:text-lg">Siguiente episodio</p>
          <p className="mt-1 text-xl font-bold tv:text-2xl">Episodio {episode + 1}</p>
          <p className="mt-2 text-base text-zinc-200 tv:mt-3 tv:text-xl">Empieza en {nextIn} s</p>
          {isTv ? (
            <p className="mt-1 text-base text-zinc-500">Pulsa Atrás para cancelar</p>
          ) : (
            <div className="flex gap-2 mt-4">
              <button
                type="button"
                onClick={() => setNextIn(0)}
                className="h-10 px-4 rounded-full bg-white text-black text-sm font-semibold hover:bg-zinc-200"
              >
                Ver ahora
              </button>
              <button
                type="button"
                onClick={() => setNextIn(null)}
                className="h-10 px-4 rounded-full bg-white/10 text-sm font-medium hover:bg-white/20"
              >
                Cancelar
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
