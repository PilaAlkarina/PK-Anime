"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { pause, resume } from "@noriginmedia/norigin-spatial-navigation";
import type { AnimeDetail } from "@/lib/anilist/types";
import { episodeInfo } from "@/lib/anilist/episodes";
import { recordWatch, WATCHED_FRACTION } from "@/lib/library/history";
import { saveLocalProgress } from "@/lib/library/my-list";
import { getAudioPreference, type AudioPreference } from "@/lib/library/preferences";
import { getPlaybackPreferences } from "@/lib/playback-preferences";
import { EmbedPlayer } from "@/components/player/embed-player";
import { useLibraryNavigation } from "./navigation-provider";
import { useIsTv } from "@/components/ui-mode";

/**
 * Full-screen player. Spatial navigation is paused here: the player moves focus itself, the
 * arrows seek, and Back closes its panels before returning to the anime.
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
  const { replace, goBack, backTo } = useLibraryNavigation();
  const isTv = useIsTv();
  // The player only runs in the browser; mounting it after hydration also lets the
  // stored Sub/Dub preference apply without a server/client mismatch
  const [audio, setAudio] = useState<AudioPreference | null>(null);
  // Sub/Dub as last chosen in the player, carried to the next episode
  const audioRef = useRef<AudioPreference>("sub");

  const total = anime.availableEpisodes ?? anime.episodes ?? 0;
  const hasNext = episode < total;
  // Read only once the player mounts (after hydration), like the audio preference
  const preferredServer = audio ? getPlaybackPreferences().preferredServer : "auto";
  const episodes = useMemo(() => episodeInfo(anime), [anime]);
  const next = episodes.get(episode + 1);

  useEffect(() => {
    const initial = audioParam ?? getAudioPreference();
    audioRef.current = initial;
    setAudio(initial);
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

  // Past the same point where the player marks it on the list service, the episode counts as
  // watched on this device's list too
  const savedLocallyRef = useRef(false);
  useEffect(() => {
    savedLocallyRef.current = false;
  }, [anime.id, episode]);

  const onPlayerEvent = (name: string, data: any) => {
    if (name === "PLAYER_EVENT" && data?.type === "source_change" && (data.audio === "sub" || data.audio === "dub")) {
      audioRef.current = data.audio;
    }
    if (name === "progress" && !savedLocallyRef.current && data?.duration > 0 && data.currentTime / data.duration >= WATCHED_FRACTION) {
      savedLocallyRef.current = true;
      saveLocalProgress(anime, episode);
    }
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
          tv={isTv}
          episodeTitle={episodes.get(episode)?.title || null}
          synopsis={anime.description || null}
          nextEpisode={
            hasNext
              ? { number: episode + 1, title: next?.title || null, thumbnail: next?.thumbnail ?? null, duration: anime.duration }
              : null
          }
          onBack={goBack}
          // Always this anime's page, whatever page playback started from (home, search…)
          onEpisodes={() => backTo(`/anime/${anime.id}`)}
          // Replace, so Back from the next episode still returns to the anime page
          onNextEpisode={
            hasNext ? () => replace(`/watch/${anime.id}/${episode + 1}?audio=${audioRef.current}`) : undefined
          }
        />
      )}
    </div>
  );
}
