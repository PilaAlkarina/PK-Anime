"use client";

import { hasOrigin, useExpandIn } from "@/lib/shared-element";
import { useEffect, useMemo, useRef, useState } from "react";
import { pause, resume } from "@noriginmedia/norigin-spatial-navigation";
import type { AnimeDetail } from "@/lib/anilist/types";
import { episodeInfo } from "@/lib/anilist/episodes";
import { recordWatch, WATCHED_FRACTION } from "@/lib/library/history";
import { findLocalEntry, saveLocalProgress, useMyList } from "@/lib/library/my-list";
import { findRemoteEntry, upsertRemoteEntry, useRemoteLibrary } from "@/lib/library/remote";
import { getAudioPreference, type AudioPreference } from "@/lib/library/preferences";
import { getPlaybackPreferences } from "@/lib/playback-preferences";
import { EmbedPlayer } from "@/components/player/embed-player";
import { useLibraryNavigation } from "./navigation-provider";
import { FinishScreen } from "./finish-screen";
import { FocusButton } from "./focusable";
import { useIsTv } from "@/components/ui-mode";
import { useAccount } from "@/lib/library/account";
import { deviceName, usePartySync, type PartyStatus } from "@/lib/watch-party/client";
import { cn } from "@/lib/utils";

/** Fade to black before leaving the player */
const EXIT_FADE_MS = 220;
const PARTY_INFO_MS = 6000;

/**
 * "Ver juntos" over the player: the room code and who's in it for a few seconds after joining,
 * then only what the others do ("Ana ha pausado")
 */
function PartyBadge({ code, status }: { code: string; status: PartyStatus }) {
  const [intro, setIntro] = useState(true);
  useEffect(() => {
    const timer = setTimeout(() => setIntro(false), PARTY_INFO_MS);
    return () => clearTimeout(timer);
  }, []);
  const others = status.names.length;
  const text = status.gone
    ? "La sala de «Ver juntos» ya no existe"
    : status.notice ?? (intro ? `Viendo juntos · código ${code} · ${others} ${others === 1 ? "conectado" : "conectados"}` : null);
  if (!text) return null;
  return (
    <div className="fixed top-4 left-1/2 z-[60] -translate-x-1/2 px-4 py-2 rounded-full bg-black/80 border border-white/15 text-sm font-bold text-white pointer-events-none tv-fade-in tv:top-[4vh] tv:px-6 tv:py-3 tv:text-xl">
      {text}
      {intro && !status.gone && !status.notice && status.names.length > 0 && (
        <span className="ml-2 font-normal text-zinc-300">({status.names.join(", ")})</span>
      )}
    </div>
  );
}

/**
 * Full-screen player. Spatial navigation is paused here: the player moves focus itself, the
 * arrows seek, and Back closes its panels before returning to the anime.
 */
export function WatchScreen({
  anime,
  episode,
  audio: audioParam,
  party,
}: {
  anime: AnimeDetail;
  episode: number;
  audio?: AudioPreference;
  /** "Ver juntos" room code: playback follows the room's */
  party?: string | null;
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

  // After the last episode of a finished anime, a screen asks for a score before leaving. Only
  // once it was watched, and not when it's already completed with a score.
  const remote = useRemoteLibrary();
  const myList = useMyList();
  const listEntry = remote ? findRemoteEntry(remote, anime) : findLocalEntry(myList, anime);
  const isLast = anime.status === "FINISHED" && !!anime.episodes && episode === anime.episodes;
  const rated = listEntry?.status === "completed" && !!listEntry.score;
  const [finish, setFinish] = useState<(() => void) | null>(null);
  // The next season, offered on that screen
  const sequel = anime.relations.find((r) => r.relationType === "SEQUEL")?.item ?? null;
  const askedRef = useRef(false);
  /** Leaves with `go`, through the score screen when it's due */
  const finishThen = (go: () => void, watched: boolean) => {
    if (isLast && watched && !rated && !askedRef.current) {
      askedRef.current = true;
      setFinish(() => go);
    } else leave(go);
  };

  // Spatial navigation only runs in the TV layout; the player moves focus itself, the score
  // screen doesn't
  useEffect(() => {
    if (!isTv || finish) return;
    pause();
    return () => resume();
  }, [isTv, finish]);

  useEffect(() => {
    recordWatch(anime, episode);
  }, [anime, episode]);

  // Past the same point where the player marks it on the list service, the episode counts as
  // watched on this device's list too
  const savedLocallyRef = useRef(false);
  useEffect(() => {
    savedLocallyRef.current = false;
  }, [anime.id, episode]);

  // Opened from an episode or card: the player grows out of it instead of fading in
  const rootRef = useRef<HTMLDivElement>(null);
  const [expanding] = useState(() => hasOrigin(anime.id));
  useExpandIn(anime.id, rootRef);

  // Leaving fades the player to black first, then navigates
  const [leaving, setLeaving] = useState(false);
  const leave = (go: () => void) => {
    if (leaving) return;
    setLeaving(true);
    setTimeout(go, EXIT_FADE_MS);
  };

  // "Ver juntos": this player follows the room, and the room follows it
  const account = useAccount();
  const partyStatus = usePartySync({
    code: party ?? null,
    animeId: anime.id,
    episode,
    audio: audioRef.current,
    name: deviceName(account?.user?.name, isTv),
    follow: (href) => replace(href),
  });
  const partyQuery = party ? `&party=${party}` : "";

  const onPlayerEvent = (name: string, data: any) => {
    if (name === "PLAYER_EVENT" && data?.type === "source_change" && (data.audio === "sub" || data.audio === "dub")) {
      audioRef.current = data.audio;
    }
    if (name === "ended") finishThen(goBack, true);
    // The episode marked as watched on the list: merged into the copy (and the finale's rating
    // prompt sees it) without downloading the whole list again
    if (name === "list_entry" && data?.entry) upsertRemoteEntry(data.entry, anime);
    if (name === "progress" && !savedLocallyRef.current && data?.duration > 0 && data.currentTime / data.duration >= WATCHED_FRACTION) {
      savedLocallyRef.current = true;
      saveLocalProgress(anime, episode);
    }
  };

  return (
    <div
      ref={rootRef}
      className={cn(
        "fixed top-0 left-0 z-50 w-screen h-screen bg-black transition-opacity ease-in",
        !expanding && "screen-in",
        leaving && "opacity-0"
      )}
      style={{ transitionDuration: `${EXIT_FADE_MS}ms` }}
    >
      {partyStatus && party && <PartyBadge code={party} status={partyStatus} />}
      {finish && (
        <FinishScreen
          anime={anime}
          entry={listEntry}
          target={remote ? "remote" : "local"}
          listName={remote ? remote.provider.name : "Mi lista"}
          onDone={() => leave(finish)}
        >
          {sequel && (
            <FocusButton variant="primary" className="mr-4 mb-3" onSelect={() => leave(() => replace(`/anime/${sequel.id}`))}>
              Siguiente: {sequel.title}
            </FocusButton>
          )}
        </FinishScreen>
      )}
      {audio && !finish && (
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
              ? {
                  number: episode + 1,
                  title: next?.title || null,
                  // Same stand-ins as the episode tiles
                  thumbnail: next?.thumbnail || anime.banner || anime.cover,
                  duration: anime.duration,
                }
              : null
          }
          onBack={() => finishThen(goBack, savedLocallyRef.current)}
          poster={episodes.get(episode)?.thumbnail || anime.banner || anime.cover}
          // Always this anime's page, whatever page playback started from (home, search…)
          onEpisodes={() => finishThen(() => backTo(`/anime/${anime.id}`), savedLocallyRef.current)}
          // Replace, so Back from the next episode still returns to the anime page
          onNextEpisode={
            hasNext
              ? () => leave(() => replace(`/watch/${anime.id}/${episode + 1}?audio=${audioRef.current}${partyQuery}`))
              : undefined
          }
        />
      )}
    </div>
  );
}
