"use client";

import { markOrigin, useFlyIn } from "@/lib/shared-element";
import { EpisodeNumeral, JapaneseLabel, Keycap, MetaWithScore } from "@/components/brand";
import { GenrePills } from "./hero";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Bookmark, Captions, Clapperboard, ListPlus, Lock, Play, Users } from "lucide-react";
import { setFocus } from "@noriginmedia/norigin-spatial-navigation";
import { ListEntryPanel } from "./list-entry-panel";
import { LibraryFooter } from "@/components/library-footer";
import { ScorePill, StatusDot } from "./list-styles";
import { trailerEmbedUrl } from "@/lib/anilist/trailer";
import { TrailerOverlay } from "./trailer-overlay";
import { usePlaybackPreferences } from "@/lib/playback-preferences";
import { subtitleLanguageName } from "@/components/player/player-core/subtitle-language";
import type { FocusDetails } from "@noriginmedia/norigin-spatial-navigation";
import type { AnimeDetail } from "@/lib/anilist/types";
import { episodeInfo, upcomingEpisodes, type UpcomingEpisode } from "@/lib/anilist/episodes";
import { airingLabel, metaLine, statusLabel, upcomingLabel } from "@/lib/library/format";
import { continueWatching, episodeProgress, useWatchHistory, WATCHED_FRACTION } from "@/lib/library/history";
import { findLocalEntry, toggleMyList, useMyList } from "@/lib/library/my-list";
import { useWatchOrder, watchOrderMarks } from "@/lib/library/franchise";
import { useAnimeThemes } from "@/lib/library/themes";
import { useParty } from "@/components/party/party-provider";
import { ThemePlayer } from "@/components/theme-player";
import { ThemesRow } from "./themes-row";
import { findRemoteEntry, REMOTE_STATUS_LABELS, remoteNextEpisode, useRemoteLibrary } from "@/lib/library/remote";
import { addToRemote } from "@/lib/library/sync";
import type { EditTarget } from "@/lib/library/use-entry-editor";
import { setAudioPreference, useAudioPreference } from "@/lib/library/preferences";
import { revealVertically, scrollToPosition } from "@/lib/tv/scroll";
import { CardRow, type RowCard } from "./catalog-row";
import { FocusButton, FocusGroup, Screen, isPointerFocus, useTvFocusable } from "./focusable";
import { EpisodeArt, type EpisodeArtFallback } from "@/components/episode-art";
import { cn } from "@/lib/utils";

const EPISODES_PER_RANGE = 50;
// The list button: "Añadir a …" or the status, which opens the editor
const LIST_ENTRY_KEY = "anime:list-entry";

// CHARACTER and OTHER relations link loosely related shows (shared characters, crossovers)
const RELATION_LABELS: Record<string, string> = {
  PREQUEL: "Precuela",
  SEQUEL: "Secuela",
  PARENT: "Historia principal",
  SIDE_STORY: "Historia paralela",
  SPIN_OFF: "Spin-off",
  ALTERNATIVE: "Versión alternativa",
  SUMMARY: "Resumen",
  COMPILATION: "Recopilación",
  CONTAINS: "Incluye",
};

function EpisodeTile({
  number,
  title,
  thumbnail,
  fallback,
  progress,
  duration,
  current,
  animeId,
  onSelect,
  onFocused,
}: {
  animeId: number;
  number: number;
  title?: string;
  thumbnail?: string | null;
  /** The series' banner and cover, for episodes without a thumbnail */
  fallback: EpisodeArtFallback;
  progress: number;
  duration: number | null;
  /** The episode to resume: its numeral is filled with the accent */
  current: boolean;
  onSelect: () => void;
  onFocused: (node: HTMLElement, details: FocusDetails) => void;
}) {
  const { ref, focused, pointerProps } = useTvFocusable({
    onSelect: () => {
      // The player opens out of this thumbnail
      markOrigin(animeId, (ref.current as HTMLElement | null)?.querySelector("[data-cover]"));
      onSelect();
    },
    onFocus: (layout, _props, details) => onFocused(layout.node, details),
  });

  const status =
    progress >= WATCHED_FRACTION
      ? "Visto"
      : progress > 0 && duration
        ? `Quedan ${Math.max(1, Math.round(duration * (1 - progress)))} min`
        : duration
          ? `${duration} min`
          : null;

  return (
    <div ref={ref} {...pointerProps} className="outline-none cursor-pointer">
      <div
        data-cover
        className={cn(
          "relative pt-[56.25%] rounded-xl overflow-hidden cover-fill border-[1.5px] border-line transition-transform duration-150",
          focused && "koma"
        )}
      >
        <EpisodeArt thumbnail={thumbnail} fallback={fallback} />
        {status && (
          <span className="absolute top-2.5 left-2.5 px-2.5 py-0.5 rounded-md bg-black/85 text-[0.95rem] font-bold text-white">
            {status}
          </span>
        )}
        <EpisodeNumeral n={number} current={current || focused} className="right-3 bottom-3 text-5xl" />
        {progress > 0 && (
          <div className="absolute left-0 right-0 bottom-0 h-1.5 bg-white/[0.18]">
            <div className="h-full bg-red-500" style={{ width: `${Math.round(progress * 100)}%` }} />
          </div>
        )}
      </div>
      <p className={cn("mt-3 text-lg font-bold", focused ? "text-white" : "text-zinc-200")}>Episodio {number}</p>
      {title && <p className="text-base text-zinc-400 line-clamp-1">{title}</p>}
    </div>
  );
}

/**
 * An announced episode that isn't out yet. Still focusable, so the remote can reach it and read
 * when it airs, but OK does nothing. Dashed outline, greyed artwork under screentone, a lock.
 */
function UpcomingEpisodeTile({
  episode,
  fallback,
  onFocused,
}: {
  episode: UpcomingEpisode;
  fallback: EpisodeArtFallback;
  onFocused: (node: HTMLElement, details: FocusDetails) => void;
}) {
  const { ref, focused, pointerProps } = useTvFocusable({
    onSelect: () => {},
    onFocus: (layout, _props, details) => onFocused(layout.node, details),
  });
  const when = upcomingLabel(episode.airingAt, episode.exactTime);

  return (
    <div ref={ref} {...pointerProps} aria-disabled="true" className="outline-none cursor-default">
      <div
        className={cn(
          "relative pt-[56.25%] rounded-xl overflow-hidden bg-zinc-900 border-[1.5px] border-dashed transition-colors duration-150",
          focused ? "border-zinc-300" : "border-zinc-600"
        )}
      >
        <EpisodeArt thumbnail={episode.thumbnail} fallback={fallback} className="grayscale opacity-30" />
        <div aria-hidden="true" className="absolute top-0 left-0 w-full h-full screentone opacity-70" />
        <span
          className={cn(
            "absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 flex items-center justify-center w-16 h-16 rounded-full bg-black/85 border-[1.5px]",
            focused ? "border-zinc-300 text-white" : "border-zinc-600 text-zinc-300"
          )}
        >
          <Lock className="w-7 h-7" />
        </span>
        <span className="absolute top-2.5 left-2.5 px-2.5 py-0.5 rounded-md bg-black/85 text-[0.95rem] font-bold text-zinc-200">
          {when}
        </span>
        <EpisodeNumeral n={episode.number} className="right-3 bottom-3 text-5xl opacity-50" />
      </div>
      <p className={cn("mt-3 text-lg font-bold", focused ? "text-zinc-200" : "text-zinc-400")}>
        Episodio {episode.number}
        {episode.duration ? <span className="font-medium text-zinc-500"> · {episode.duration} min</span> : null}
      </p>
      <p className="text-base text-zinc-500 line-clamp-1">{episode.title || "Aún no publicado"}</p>
    </div>
  );
}

export function AnimeScreen({ anime }: { anime: AnimeDetail }) {
  const router = useRouter();
  // The chosen card's cover flies into the cover shown when there is no banner
  const coverRef = useRef<HTMLImageElement>(null);
  useFlyIn(anime.id, coverRef);
  const audio = useAudioPreference();
  const prefs = usePlaybackPreferences();
  const myList = useMyList();
  const history = useWatchHistory();
  const remote = useRemoteLibrary();
  const scrollRef = useRef<HTMLDivElement>(null);
  const localEntry = findLocalEntry(myList, anime);
  const [adding, setAdding] = useState(false);
  const [trailerSrc, setTrailerSrc] = useState<string | null>(null);
  const [editingEntry, setEditingEntry] = useState(false);
  const hasTrailer = !!trailerEmbedUrl(anime.trailer);

  const total = anime.availableEpisodes ?? anime.episodes ?? anime.streamingEpisodes.length;
  const titles = useMemo(() => episodeInfo(anime), [anime]);
  // Announced episodes not out yet, shown locked after the available ones
  const upcoming = useMemo(() => upcomingEpisodes(anime, total), [anime, total]);
  const listed = total + upcoming.length;

  // History is only read after hydration (empty on the server), so progress never mismatches
  const entry = history.find((e) => e.anime.id === anime.id);
  const resume = useMemo(
    () =>
      entry
        ? continueWatching([{ ...entry, anime: { ...entry.anime, availableEpisodes: total, episodes: anime.episodes } }])[0]
        : undefined,
    [entry, total, anime.episodes]
  );

  // The lists may be further along than the watch history (another device, an import)
  const remoteEntry = findRemoteEntry(remote, anime);
  const counts = { availableEpisodes: total, episodes: anime.episodes };
  const listNext = Math.max(remoteNextEpisode(remoteEntry, counts) ?? 0, remoteNextEpisode(localEntry, counts) ?? 0);
  const playEpisode = Math.max(resume?.episode ?? 0, listNext) || 1;
  const watchedUpTo = Math.max(remoteEntry?.progress ?? 0, localEntry?.progress ?? 0);

  // One list on the page: the signed-in service's (every change is copied here too) or this device's
  const listTarget: EditTarget = remote ? "remote" : "local";
  const listEntry = remote ? remoteEntry : localEntry;
  const listName = remote ? remote.provider.name : "Mi lista";
  const continuing = !!resume && resume.episode === playEpisode && resume.progress > 0;
  // Only a real position (history or a list) marks an episode as the current one
  const hasPosition = !!resume || listNext > 0;

  const [range, setRange] = useState(0);
  // Open on the block that holds the episode to resume
  useEffect(() => {
    if (playEpisode > 1) setRange(Math.floor((playEpisode - 1) / EPISODES_PER_RANGE));
  }, [playEpisode]);

  const addToList = async () => {
    if (!remote) return toggleMyList(anime);
    if (adding) return;
    setAdding(true);
    await addToRemote(anime);
    setAdding(false);
  };

  const play = (episode: number) => router.push(`/watch/${anime.id}/${episode}?audio=${audio}`);
  // "Ver juntos": creates a room with this device as host and opens the episode, which picks it
  // for the room; others join from their "Ver juntos" button or /party
  const partyApi = useParty();
  const [startingParty, setStartingParty] = useState(false);
  const watchTogether = async (episode: number) => {
    if (startingParty) return;
    setStartingParty(true);
    if (await partyApi.create()) return setStartingParty(false);
    router.push(`/watch/${anime.id}/${episode}?audio=${audio}`);
  };

  const rangeCount = Math.ceil(listed / EPISODES_PER_RANGE);
  const firstInRange = range * EPISODES_PER_RANGE + 1;
  const episodes = Array.from(
    { length: Math.max(0, Math.min(EPISODES_PER_RANGE, listed - firstInRange + 1)) },
    (_, i) => firstInRange + i
  );

  const revealTile = (node: HTMLElement, details: FocusDetails) => {
    if (!isPointerFocus(details)) revealVertically(scrollRef.current, node, 48);
  };
  const revealRow = (node: HTMLElement) => revealVertically(scrollRef.current, node, 24);

  const relationCards: RowCard[] = anime.relations
    .filter((r) => RELATION_LABELS[r.relationType])
    .map((r) => ({
      item: r.item,
      badge: RELATION_LABELS[r.relationType],
      onSelect: () => router.push(`/anime/${r.item.id}`),
    }));
  // The franchise in watch order, marking where this one is and what's watched
  const order = useWatchOrder(anime);
  const orderMarks = watchOrderMarks(order, anime.id, (item) => findRemoteEntry(remote, item) ?? findLocalEntry(myList, item));
  const orderCards: RowCard[] = order.map((item, index) => ({
    item,
    rank: index + 1,
    badge: orderMarks[index]?.label,
    badgeClassName: orderMarks[index]?.className,
    onSelect: () => item.id !== anime.id && router.push(`/anime/${item.id}`),
  }));
  // Openings and endings from AnimeThemes; one opens the theme player from there
  const themes = useAnimeThemes(anime.id);
  const [themeIndex, setThemeIndex] = useState<number | null>(null);

  const recommendationCards: RowCard[] = anime.recommendations.map((item) => ({
    item,
    onSelect: () => router.push(`/anime/${item.id}`),
  }));

  const subtitle = anime.romajiTitle && anime.romajiTitle !== anime.title ? anime.romajiTitle : anime.nativeTitle;
  const subtitlesLabel = !prefs.subtitlesEnabled
    ? "desactivados"
    : prefs.subtitleLanguages.length
      ? subtitleLanguageName(prefs.subtitleLanguages[0])
      : "los del servidor";
  const details = [statusLabel(anime.status), anime.studios[0], anime.duration ? `${anime.duration} min` : null]
    .filter(Boolean)
    .join(" · ");

  return (
    <Screen>
      {trailerSrc && <TrailerOverlay src={trailerSrc} title={anime.title} onClose={() => setTrailerSrc(null)} />}
      <div
        ref={scrollRef}
        className="fixed top-0 bottom-0 left-0 right-0 overflow-y-auto overflow-x-hidden tv-no-scrollbar"
      >
        <header className="relative pb-12">
          {/* AniList banners are about 1900×400, so the box keeps close to that shape instead of
              blowing up and cropping the middle of it */}
          <div className={cn("absolute top-0 right-0 overflow-hidden", anime.banner ? "w-full h-[24vw]" : "w-[78%] h-[75vh]")}>
            {anime.banner ? (
              <img src={anime.banner} alt="" decoding="async" className="w-full h-full object-cover object-top tv-fade-in" />
            ) : (
              anime.cover && (
                <img
                  ref={coverRef}
                  src={anime.cover}
                  alt=""
                  decoding="async"
                  className="absolute top-[10vh] right-[8rem] h-[48vh] rounded-xl tv-cover-shadow tv-fade-in"
                />
              )
            )}
            <div className="absolute left-0 right-0 bottom-0 h-1/2 bg-gradient-to-t from-black to-transparent" />
          </div>
          <div
            className={cn(
              "absolute top-0 left-0 h-[75vh] bg-gradient-to-r from-black to-transparent",
              anime.banner ? "w-[70%] via-black/70" : "w-[75%] via-black/90"
            )}
          />
          <div
            aria-hidden="true"
            className="absolute top-0 left-[24%] w-[50%] h-[75vh] screentone [mask-image:linear-gradient(90deg,transparent,#000_45%,transparent)]"
          />

          <div className="relative pl-[10rem] pt-[10vh] w-[62%]">
            {/* What the remote's Back key does here */}
            <p className="flex items-center text-lg font-medium text-zinc-200">
              <Keycap className="mr-2.5">⟵</Keycap>
              Volver
            </p>
            <h1 className="mt-4 text-[4.5rem] leading-[1.1] line-clamp-2">{anime.title}</h1>
            {subtitle && <p className="mt-2 text-xl font-medium text-zinc-400 line-clamp-1">{subtitle}</p>}
            <p className="mt-5 text-2xl font-medium text-zinc-200">
              <MetaWithScore before={metaLine(anime, { score: false })} score={anime.score} />
            </p>
            {details && <p className="mt-2 text-lg text-zinc-400">{details}</p>}
            {anime.genres.length > 0 && <GenrePills genres={anime.genres} className="mt-4" />}
            {anime.description && (
              <p className="mt-6 text-xl leading-relaxed text-zinc-300 line-clamp-5">{anime.description}</p>
            )}
            {anime.nextEpisode && (
              <p className="mt-4 text-lg text-zinc-300">
                {anime.status === "NOT_YET_RELEASED" && anime.nextEpisode.episode === 1
                  ? `Se estrena ${airingLabel(anime.nextEpisode.airingAt)}`
                  : `Episodio ${anime.nextEpisode.episode} ${airingLabel(anime.nextEpisode.airingAt)}`}
              </p>
            )}

            <FocusGroup
              className="flex items-center mt-8"
              onFocusInside={() => scrollToPosition(scrollRef.current, { top: 0 })}
            >
              {total > 0 && (
                <FocusButton variant="primary" className="mr-4" onSelect={() => play(playEpisode)}>
                  <Play className="w-6 h-6 mr-3" fill="currentColor" />
                  {continuing ? `Continuar EP ${playEpisode}` : `Ver EP ${playEpisode}`}
                </FocusButton>
              )}
              {total > 0 && !partyApi.party && (
                <FocusButton variant="secondary" className="mr-4" onSelect={() => watchTogether(playEpisode)}>
                  <Users className="w-6 h-6 mr-3" />
                  {startingParty ? "Creando sala…" : "Ver juntos"}
                </FocusButton>
              )}
              {/* Segmented control: a raised track, the selected side in paper */}
              <div role="group" aria-label="Audio" className="flex mr-4 p-1.5 rounded-full bg-ink-3 border-[1.5px] border-line">
                {(["sub", "dub"] as const).map((value) => (
                  <FocusButton
                    key={value}
                    variant="segment"
                    className="h-[3.25rem] px-6 text-xl"
                    active={audio === value}
                    onSelect={() => setAudioPreference(value)}
                  >
                    {value === "sub" ? "Original" : "Doblaje"}
                  </FocusButton>
                ))}
              </div>
              {hasTrailer && (
                <FocusButton
                  variant="secondary"
                  className="mr-4"
                  // The player checks this origin before taking play/pause from the page
                  onSelect={() => setTrailerSrc(trailerEmbedUrl(anime.trailer, window.location.origin))}
                >
                  <Clapperboard className="w-6 h-6 mr-3" />
                  Tráiler
                </FocusButton>
              )}
              {listEntry ? (
                <FocusButton
                  variant="secondary"
                  focusKey={LIST_ENTRY_KEY}
                  active={editingEntry}
                  onSelect={() => setEditingEntry(!editingEntry)}
                >
                  <StatusDot status={listEntry.status} className="w-3.5 h-3.5 mr-3" />
                  {REMOTE_STATUS_LABELS[listEntry.status]}
                </FocusButton>
              ) : (
                <FocusButton variant="secondary" focusKey={LIST_ENTRY_KEY} onSelect={addToList}>
                  {remote ? <ListPlus className="w-6 h-6 mr-3" /> : <Bookmark className="w-6 h-6 mr-3" />}
                  {adding ? "Añadiendo…" : remote ? `Añadir a ${remote.provider.name}` : "Mi lista"}
                </FocusButton>
              )}
            </FocusGroup>
            <p className="flex items-center mt-5 text-lg text-zinc-400">
              <Captions className="w-6 h-6 mr-3" />
              Subtítulos: {subtitlesLabel} · se cambian en Ajustes
            </p>
            {listEntry ? (
              <p className="mt-2 text-lg text-zinc-400">
                En {listName}: {REMOTE_STATUS_LABELS[listEntry.status]}
                {listEntry.progress > 0 &&
                  ` · ${listEntry.progress}${anime.episodes ? ` de ${anime.episodes}` : ""} episodios vistos`}
                {listEntry.score ? (
                  <>
                    {" · Tu nota "}
                    <ScorePill score={listEntry.score} inline className="px-2 py-1 text-lg" />
                  </>
                ) : null}
              </p>
            ) : (
              remote &&
              localEntry && (
                <p className="mt-2 text-lg text-zinc-400">
                  Solo en este dispositivo: {REMOTE_STATUS_LABELS[localEntry.status]}
                  {localEntry.progress > 0 && ` · ${localEntry.progress} episodios vistos`}. Al añadirlo a{" "}
                  {remote.provider.name} se sube con estos datos.
                </p>
              )
            )}
            {listEntry && editingEntry && (
              <ListEntryPanel
                anime={anime}
                entry={listEntry}
                target={listTarget}
                providerName={listName}
                onReveal={revealRow}
                onClose={() => {
                  setEditingEntry(false);
                  // After the render: removing swaps the button for "Añadir a …" under the same key
                  setTimeout(() => setFocus(LIST_ENTRY_KEY));
                }}
              />
            )}
          </div>
        </header>

        {listed > 0 && (
          <section className="relative pl-[10rem] pr-16">
            <h2 className="text-3xl font-bold">
              Episodios
              <JapaneseLabel title="Episodios" />
            </h2>
            {rangeCount > 1 && (
              <FocusGroup className="flex flex-wrap mt-5">
                {Array.from({ length: rangeCount }, (_, i) => {
                  const from = i * EPISODES_PER_RANGE + 1;
                  const to = Math.min(listed, from + EPISODES_PER_RANGE - 1);
                  return (
                    <FocusButton
                      key={i}
                      variant="chip"
                      className="mr-3 mb-3"
                      active={i === range}
                      onSelect={() => setRange(i)}
                    >
                      {from}–{to}
                    </FocusButton>
                  );
                })}
              </FocusGroup>
            )}
            <FocusGroup key={range} className="grid grid-cols-4 gap-x-6 gap-y-8 mt-6">
              {episodes.map((number) =>
                number > total ? (
                  <UpcomingEpisodeTile
                    key={number}
                    episode={upcoming[number - total - 1]}
                    fallback={anime}
                    onFocused={revealTile}
                  />
                ) : (
                  <EpisodeTile
                    key={number}
                    animeId={anime.id}
                    number={number}
                    title={titles.get(number)?.title}
                    thumbnail={titles.get(number)?.thumbnail}
                    fallback={anime}
                    progress={Math.max(
                      entry ? episodeProgress(anime.id, number) : 0,
                      // Episodes a list counts as watched show as finished
                      watchedUpTo >= number ? 1 : 0
                    )}
                    duration={anime.duration}
                    current={hasPosition && number === playEpisode}
                    onSelect={() => play(number)}
                    onFocused={revealTile}
                  />
                )
              )}
            </FocusGroup>
          </section>
        )}

        <div className="relative pl-[7rem] mt-12 space-y-6">
          {themes && themes.length > 0 && <ThemesRow themes={themes} onPlay={setThemeIndex} onRowFocus={revealRow} />}
          {orderCards.length > 1 && (
            <CardRow rowKey="watch-order" title="Orden de visionado" cards={orderCards} onRowFocus={revealRow} />
          )}
          {relationCards.length > 0 && (
            <CardRow rowKey="relations" title="Relacionados" cards={relationCards} onRowFocus={revealRow} />
          )}
          {recommendationCards.length > 0 && (
            <CardRow rowKey="recommendations" title="Recomendados" cards={recommendationCards} onRowFocus={revealRow} />
          )}
        </div>
        <div className="relative pl-[10rem] pr-16">
          <LibraryFooter onFocus={revealRow} />
        </div>
        <div className="h-[20vh]" />
      </div>
      {themes && themeIndex !== null && (
        <ThemePlayer
          tracks={themes.map((theme) => ({ theme, animeTitle: anime.title }))}
          startIndex={themeIndex}
          onClose={() => setThemeIndex(null)}
        />
      )}
    </Screen>
  );
}
