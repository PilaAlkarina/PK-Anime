"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Bookmark, BookmarkCheck, Play } from "lucide-react";
import type { FocusDetails } from "@noriginmedia/norigin-spatial-navigation";
import type { AnimeDetail } from "@/lib/anilist/types";
import { GENRE_LABELS } from "@/lib/anilist/genres";
import { airingLabel, metaLine, statusLabel } from "@/lib/library/format";
import { continueWatching, episodeProgress, useWatchHistory } from "@/lib/library/history";
import { isInMyList, toggleMyList, useMyList } from "@/lib/library/my-list";
import { setAudioPreference, useAudioPreference } from "@/lib/library/preferences";
import { revealVertically, scrollToPosition } from "@/lib/tv/scroll";
import { CardRow, type RowCard } from "./catalog-row";
import { FocusButton, FocusGroup, Screen, isPointerFocus, useTvFocusable } from "./focusable";
import { cn } from "@/lib/utils";

const EPISODES_PER_RANGE = 50;

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

/** Episode titles and thumbnails, from AniList's streaming links ("Episode 3 - Title") */
function episodeInfo(anime: AnimeDetail) {
  const info = new Map<number, { title: string; thumbnail: string | null }>();
  for (const ep of anime.streamingEpisodes) {
    const match = ep.title.match(/^Episode\s+(\d+)\s*[-–:]?\s*(.*)$/i);
    if (match) info.set(Number(match[1]), { title: match[2].trim(), thumbnail: ep.thumbnail });
  }
  return info;
}

function EpisodeTile({
  number,
  title,
  thumbnail,
  progress,
  onSelect,
  onFocused,
}: {
  number: number;
  title?: string;
  thumbnail?: string | null;
  progress: number;
  onSelect: () => void;
  onFocused: (node: HTMLElement, details: FocusDetails) => void;
}) {
  const { ref, focused, pointerProps } = useTvFocusable({
    onSelect,
    onFocus: (layout, _props, details) => onFocused(layout.node, details),
  });

  return (
    <div ref={ref} {...pointerProps} className="outline-none cursor-pointer">
      <div
        className={cn(
          "relative pt-[56.25%] rounded-xl overflow-hidden bg-zinc-900 transition-transform duration-150",
          focused && "scale-105 ring-[0.25rem] ring-white shadow-[0_0.75rem_2rem_rgba(0,0,0,0.6)]"
        )}
      >
        {thumbnail ? (
          <img
            src={thumbnail}
            alt=""
            loading="lazy"
            decoding="async"
            className="absolute top-0 left-0 w-full h-full object-cover"
          />
        ) : (
          <span className="absolute top-0 left-0 w-full h-full flex items-center justify-center text-6xl font-bold text-white/25">
            {number}
          </span>
        )}
        {progress > 0 && (
          <div className="absolute left-0 right-0 bottom-0 h-1.5 bg-white/25">
            <div className="h-full bg-red-600" style={{ width: `${Math.round(progress * 100)}%` }} />
          </div>
        )}
      </div>
      <p className={cn("mt-3 text-lg font-bold", focused ? "text-white" : "text-zinc-200")}>Episodio {number}</p>
      {title && <p className="text-base text-zinc-400 line-clamp-1">{title}</p>}
    </div>
  );
}

export function AnimeScreen({ anime }: { anime: AnimeDetail }) {
  const router = useRouter();
  const audio = useAudioPreference();
  const myList = useMyList();
  const history = useWatchHistory();
  const scrollRef = useRef<HTMLDivElement>(null);
  const inMyList = isInMyList(myList, anime.id);

  const total = anime.availableEpisodes ?? anime.episodes ?? anime.streamingEpisodes.length;
  const titles = useMemo(() => episodeInfo(anime), [anime]);

  // History is only read after hydration (empty on the server), so progress never mismatches
  const entry = history.find((e) => e.anime.id === anime.id);
  const resume = useMemo(
    () =>
      entry
        ? continueWatching([{ ...entry, anime: { ...entry.anime, availableEpisodes: total, episodes: anime.episodes } }])[0]
        : undefined,
    [entry, total, anime.episodes]
  );

  const [range, setRange] = useState(0);
  // Open on the block that holds the episode to resume
  useEffect(() => {
    if (resume) setRange(Math.floor((resume.episode - 1) / EPISODES_PER_RANGE));
  }, [resume?.episode]);

  const play = (episode: number) => router.push(`/watch/${anime.id}/${episode}?audio=${audio}`);

  const rangeCount = Math.ceil(total / EPISODES_PER_RANGE);
  const firstInRange = range * EPISODES_PER_RANGE + 1;
  const episodes = Array.from(
    { length: Math.max(0, Math.min(EPISODES_PER_RANGE, total - firstInRange + 1)) },
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
  const recommendationCards: RowCard[] = anime.recommendations.map((item) => ({
    item,
    onSelect: () => router.push(`/anime/${item.id}`),
  }));

  const subtitle = anime.romajiTitle && anime.romajiTitle !== anime.title ? anime.romajiTitle : anime.nativeTitle;
  const details = [statusLabel(anime.status), anime.studios[0], anime.duration ? `${anime.duration} min` : null]
    .filter(Boolean)
    .join(" · ");

  return (
    <Screen>
      <div
        ref={scrollRef}
        className="fixed top-0 bottom-0 left-0 right-0 overflow-y-auto overflow-x-hidden tv-no-scrollbar"
      >
        <header className="relative pb-12">
          <div className="absolute top-0 right-0 w-[78%] h-[75vh] overflow-hidden">
            {anime.banner ? (
              <img src={anime.banner} alt="" decoding="async" className="w-full h-full object-cover tv-fade-in" />
            ) : (
              anime.cover && (
                <img
                  src={anime.cover}
                  alt=""
                  decoding="async"
                  className="absolute top-[10vh] right-[8rem] h-[48vh] rounded-xl tv-cover-shadow tv-fade-in"
                />
              )
            )}
            <div className="absolute left-0 right-0 bottom-0 h-1/2 bg-gradient-to-t from-black to-transparent" />
          </div>
          <div className="absolute top-0 left-0 w-[75%] h-[75vh] bg-gradient-to-r from-black via-black/90 to-transparent" />

          <div className="relative pl-[10rem] pt-[13vh] w-[62%]">
            <h1 className="text-6xl font-bold leading-tight line-clamp-2">{anime.title}</h1>
            {subtitle && <p className="mt-2 text-xl text-zinc-400 line-clamp-1">{subtitle}</p>}
            <p className="mt-5 text-xl text-zinc-200">{metaLine(anime)}</p>
            <p className="mt-2 text-lg text-zinc-400">
              {[details, anime.genres.map((g) => GENRE_LABELS[g] || g).join(", ")].filter(Boolean).join(" · ")}
            </p>
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
                <FocusButton variant="primary" className="mr-4" onSelect={() => play(resume?.episode ?? 1)}>
                  <Play className="w-6 h-6 mr-3" fill="currentColor" />
                  {resume?.progress ? `Continuar EP ${resume.episode}` : `Ver EP ${resume?.episode ?? 1}`}
                </FocusButton>
              )}
              <FocusButton
                variant="secondary"
                className="mr-2"
                active={audio === "sub"}
                onSelect={() => setAudioPreference("sub")}
              >
                SUB
              </FocusButton>
              <FocusButton
                variant="secondary"
                className="mr-4"
                active={audio === "dub"}
                onSelect={() => setAudioPreference("dub")}
              >
                DUB
              </FocusButton>
              <FocusButton variant="secondary" onSelect={() => toggleMyList(anime)}>
                {inMyList ? <BookmarkCheck className="w-6 h-6 mr-3" /> : <Bookmark className="w-6 h-6 mr-3" />}
                {inMyList ? "En mi lista" : "Mi lista"}
              </FocusButton>
            </FocusGroup>
          </div>
        </header>

        {total > 0 && (
          <section className="relative pl-[10rem] pr-16">
            <h2 className="text-3xl font-bold">Episodios</h2>
            {rangeCount > 1 && (
              <FocusGroup className="flex flex-wrap mt-5">
                {Array.from({ length: rangeCount }, (_, i) => {
                  const from = i * EPISODES_PER_RANGE + 1;
                  const to = Math.min(total, from + EPISODES_PER_RANGE - 1);
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
              {episodes.map((number) => (
                <EpisodeTile
                  key={number}
                  number={number}
                  title={titles.get(number)?.title}
                  thumbnail={titles.get(number)?.thumbnail}
                  progress={entry ? episodeProgress(anime.id, number) : 0}
                  onSelect={() => play(number)}
                  onFocused={revealTile}
                />
              ))}
            </FocusGroup>
          </section>
        )}

        <div className="relative pl-[7rem] mt-12 space-y-6">
          {relationCards.length > 0 && (
            <CardRow rowKey="relations" title="Relacionados" cards={relationCards} onRowFocus={revealRow} />
          )}
          {recommendationCards.length > 0 && (
            <CardRow rowKey="recommendations" title="Recomendados" cards={recommendationCards} onRowFocus={revealRow} />
          )}
        </div>
        <div className="h-[20vh]" />
      </div>
    </Screen>
  );
}
