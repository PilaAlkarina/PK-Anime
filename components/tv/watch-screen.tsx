"use client";

import { useEffect, useState } from "react";
import { pause, resume } from "@noriginmedia/norigin-spatial-navigation";
import type { AnimeDetail } from "@/lib/anilist/types";
import { recordWatch } from "@/lib/library/history";
import { getAudioPreference, type AudioPreference } from "@/lib/library/preferences";
import { getPlaybackPreferences } from "@/lib/playback-preferences";
import { EmbedPlayer } from "@/components/player/embed-player";
import { useBackHandler, useLibraryNavigation } from "./navigation-provider";

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
  const { replace } = useLibraryNavigation();
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

  useEffect(() => {
    pause();
    return () => resume();
  }, []);

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
      {nextIn !== null && (
        <div className="absolute right-[5vw] bottom-[14vh] z-[60] w-[26rem] p-6 rounded-2xl bg-zinc-900/95 tv-fade-in">
          <p className="text-lg text-zinc-400">Siguiente episodio</p>
          <p className="mt-1 text-2xl font-bold">Episodio {episode + 1}</p>
          <p className="mt-3 text-xl text-zinc-200">Empieza en {nextIn} s</p>
          <p className="mt-1 text-base text-zinc-500">Pulsa Atrás para cancelar</p>
        </div>
      )}
    </div>
  );
}
