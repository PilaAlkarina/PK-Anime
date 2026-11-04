"use client";

import { EpisodeNumeral, Hanko, MetaWithScore, Stamp, japaneseFor } from "@/components/brand";
import { Fragment, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Bookmark, BookmarkCheck, ChevronLeft, ChevronRight, Play } from "lucide-react";
import type { CatalogItem, CatalogRow } from "@/lib/anilist/types";
import { GENRE_LABELS } from "@/lib/anilist/genres";
import { metaLine } from "@/lib/library/format";
import { continueWatching, useWatchHistory, type ContinueItem } from "@/lib/library/history";
import { findLocalEntry, removeLocalEntry, toggleMyList, useMyList } from "@/lib/library/my-list";
import { findRemoteEntry, mergeContinueWatching, REMOTE_STATUS_LABELS, useRemoteLibrary } from "@/lib/library/remote";
import { addToRemote, removeFromRemote } from "@/lib/library/sync";
import { usePagedRow } from "@/components/tv/catalog-row";
import { useAnimeDetail } from "@/components/tv/hero";
import { HorizontalRow } from "./horizontal-row";
import { PosterCard } from "./poster-card";
import { TodayAiring } from "./today-airing";
import { AccountAvatar } from "./web-shell";
import { cn } from "@/lib/utils";

const FEATURED_COUNT = 5;

/** The first row's leading titles, one at a time; arrows and dots move between them */
function Featured({ row, resume }: { row: CatalogRow; resume: ContinueItem[] }) {
  const items = row.items.slice(0, FEATURED_COUNT);
  const [index, setIndex] = useState(0);
  const item = items[index];
  const detail = useAnimeDetail(item?.id ?? null, 0);
  if (!item) return null;

  const resumeEntry = resume.find((r) => r.anime.id === item.id);
  const episode = resumeEntry?.episode ?? 1;
  const image = item.banner || item.cover;
  const genres = item.genres
    .slice(0, 3)
    .map((g) => GENRE_LABELS[g] || g)
    .join(", ");
  const step = (by: number) => setIndex((i) => (i + by + items.length) % items.length);
  const stampLabel = row.kind === "trending" ? `TENDENCIA N.º ${index + 1}` : `${row.title.toUpperCase()} · N.º ${index + 1}`;
  const stampJapanese = japaneseFor(row.title) ? `${japaneseFor(row.title)} No.${index + 1}` : undefined;

  return (
    <section aria-label="Destacado" aria-roledescription="carrusel" className="px-4 md:px-8">
      <div className="relative overflow-hidden rounded-[18px] cover-fill md:border-[1.5px] md:border-line md:min-h-[27rem] md:flex md:items-end">
        <div className="relative pt-[56.25%] md:pt-0 md:absolute md:top-0 md:left-0 md:w-full md:h-full">
          {image && (
            <img
              key={image}
              src={image}
              alt=""
              decoding="async"
              className={cn(
                "absolute top-0 left-0 w-full h-full object-cover tv-fade-in",
                !item.banner && "md:object-contain md:object-right md:bg-zinc-900"
              )}
            />
          )}
          <div className="hidden md:block absolute top-0 bottom-0 left-0 w-[72%] bg-gradient-to-r from-black/95 via-black/75 to-transparent" />
          <div
            aria-hidden="true"
            className="hidden md:block absolute top-0 bottom-0 left-[25%] w-[55%] screentone [mask-image:linear-gradient(90deg,transparent,#000_45%,transparent)]"
          />
          {/* Phones: the screentone sits along the bottom edge, with finer dots */}
          <div
            aria-hidden="true"
            className="md:hidden absolute left-0 right-0 bottom-0 h-[60%] screentone-fine [mask-image:linear-gradient(0deg,transparent,#000_40%,transparent_85%)]"
          />
          <Stamp japanese={stampJapanese} backed className="absolute top-3 left-3 md:hidden text-[0.7rem]">
            {stampLabel}
          </Stamp>
          {items.length > 1 && (
            <div className="md:hidden absolute left-0 right-0 bottom-3 flex justify-center gap-1.5" aria-hidden>
              {items.map((it, i) => (
                <span
                  key={it.id}
                  className={cn("h-1.5 rounded-full transition-all", i === index ? "w-[18px] bg-red-500" : "w-1.5 bg-white/45")}
                />
              ))}
            </div>
          )}
        </div>

        <div key={item.id} className="hidden md:flex relative flex-col gap-3 max-w-[40rem] p-10 tv-fade-in">
          <Stamp japanese={stampJapanese} className="text-[13px]">
            {stampLabel}
          </Stamp>
          <h1 className="text-[2.6rem] leading-[1.1] line-clamp-2">{item.title}</h1>
          <p className="text-[0.95rem] font-medium text-zinc-200">
            <MetaWithScore before={metaLine(item, { score: false })} score={item.score} after={genres} />
          </p>
          <p className="text-[0.95rem] leading-relaxed text-zinc-200 line-clamp-3 min-h-[4.5rem]">{detail?.description}</p>
          <FeaturedActions item={item} episode={episode} resuming={!!resumeEntry} />
        </div>

        {items.length > 1 && (
          <div className="absolute right-3 bottom-3 md:right-6 md:bottom-6 flex items-center gap-2">
            <button
              type="button"
              aria-label="Destacado anterior"
              onClick={() => step(-1)}
              className="flex items-center justify-center w-9 h-9 md:w-10 md:h-10 rounded-full border-[1.5px] border-line bg-black/80 hover:bg-black"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <button
              type="button"
              aria-label="Destacado siguiente"
              onClick={() => step(1)}
              className="flex items-center justify-center w-9 h-9 md:w-10 md:h-10 rounded-full border-[1.5px] border-line bg-black/80 hover:bg-black"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>
        )}
      </div>

      {/* Phones: details under the artwork, buttons full width */}
      <div key={`m-${item.id}`} className="md:hidden flex flex-col gap-3 mt-3">
        <div>
          <h1 className="text-[1.4rem] leading-[1.15] line-clamp-2">{item.title}</h1>
          <p className="mt-1 text-sm font-medium text-zinc-400">
            <MetaWithScore before={metaLine(item, { score: false })} score={item.score} />
          </p>
        </div>
        <FeaturedActions item={item} episode={episode} resuming={!!resumeEntry} compact />
      </div>
    </section>
  );
}

function FeaturedActions({
  item,
  episode,
  resuming,
  compact = false,
}: {
  item: CatalogItem;
  episode: number;
  resuming: boolean;
  compact?: boolean;
}) {
  const myList = useMyList();
  const remote = useRemoteLibrary();
  // Like the anime page: the signed-in service's list, or this device's
  const listEntry = remote ? findRemoteEntry(remote, item) : findLocalEntry(myList, item);
  const inMyList = !!listEntry;
  // A quick toggle only for planned titles; anything with a status or progress is edited on its page
  const toggleable = !listEntry || (listEntry.status === "planning" && listEntry.progress === 0);
  const toggle = () => {
    if (!listEntry) return remote ? addToRemote(item) : toggleMyList(item);
    if (remote) removeFromRemote(item);
    else removeLocalEntry(item.id);
  };

  return (
    <div className={cn("flex items-center gap-2.5", !compact && "mt-2")}>
      <Link
        href={`/watch/${item.id}/${episode}`}
        className={cn(
          "flex items-center justify-center gap-2 rounded-full bg-red-500 text-black font-bold hover:bg-red-400",
          !compact && "shadow-hard",
          compact ? "flex-1 h-12 rounded-xl" : "h-12 px-6"
        )}
      >
        <Play className="w-4 h-4" fill="currentColor" />
        {resuming ? `Continuar EP ${episode}` : `Ver episodio ${episode}`}
      </Link>
      {!compact && (
        <Link
          href={`/anime/${item.id}`}
          className="flex items-center h-12 px-5 rounded-full bg-ink-3 border-[1.5px] border-line font-bold hover:bg-zinc-800"
        >
          Más información
        </Link>
      )}
      {toggleable ? (
        <button
          type="button"
          onClick={toggle}
          aria-pressed={inMyList}
          aria-label={inMyList ? "Quitar de Mi lista" : "Añadir a Mi lista"}
          className={cn(
            "flex items-center justify-center w-12 h-12 flex-shrink-0 bg-ink-3 border-[1.5px] border-line hover:bg-zinc-800",
            compact ? "rounded-xl" : "rounded-full"
          )}
        >
          {inMyList ? <BookmarkCheck className="w-5 h-5" /> : <Bookmark className="w-5 h-5" />}
        </button>
      ) : (
        <Link
          href={`/anime/${item.id}`}
          aria-label={`En tu lista: ${REMOTE_STATUS_LABELS[listEntry!.status]}. Cambiarlo en su ficha`}
          title={REMOTE_STATUS_LABELS[listEntry!.status]}
          className={cn(
            "flex items-center justify-center w-12 h-12 flex-shrink-0 bg-ink-3 border-[1.5px] border-line hover:bg-zinc-800",
            compact ? "rounded-xl" : "rounded-full"
          )}
        >
          <BookmarkCheck className="w-5 h-5" />
        </Link>
      )}
    </div>
  );
}

/**
 * Wide card for "Seguir viendo": artwork, the episode and how far it got. The `current` one (the
 * latest) stands out like a selected panel, with its episode number in the accent
 */
function ResumeCard({ entry, current = false }: { entry: ContinueItem; current?: boolean }) {
  const { anime, episode, progress } = entry;
  const image = anime.banner || anime.cover;
  return (
    <Link
      href={`/watch/${anime.id}/${episode}`}
      className="group flex-shrink-0 w-[15rem] md:w-[19rem] snap-start flex flex-col gap-2 outline-none"
    >
      <div
        className={cn(
          "relative pt-[56.25%] rounded-xl overflow-hidden cover-fill transition duration-200 ease-out",
          "group-hover:koma-sm md:group-hover:koma-md group-focus-visible:koma-sm md:group-focus-visible:koma-md",
          current && "koma-sm md:koma-md"
        )}
        style={anime.color ? ({ "--cover-color": anime.color } as React.CSSProperties) : undefined}
      >
        {image && (
          <img
            src={image}
            alt=""
            loading="lazy"
            decoding="async"
            className="absolute top-0 left-0 w-full h-full object-cover"
          />
        )}
        {/* Phones have no hover: a play button says the card plays */}
        <span className="md:hidden absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 flex items-center justify-center w-10 h-10 rounded-full bg-black/75 text-white">
          <Play className="w-4 h-4 ml-0.5" fill="currentColor" />
        </span>
        <EpisodeNumeral
          n={episode}
          current={current}
          outline="text-outline-hair md:text-outline-thin"
          className="top-2 left-2.5 text-[1.6rem] md:left-3 md:text-[1.9rem]"
        />
        {progress > 0 && (
          <div className="absolute left-0 right-0 bottom-0 h-1 md:h-[5px] bg-white/[0.18]">
            <div className="h-full bg-red-500" style={{ width: `${Math.round(progress * 100)}%` }} />
          </div>
        )}
      </div>
      <span className="text-sm md:text-[0.95rem] font-bold line-clamp-1">{anime.title}</span>
      <span className="-mt-1.5 text-xs text-zinc-400">
        Episodio {episode}
        {progress > 0 && ` · visto el ${Math.round(progress * 100)} %`}
      </span>
    </Link>
  );
}

function CatalogRowSection({ row }: { row: CatalogRow }) {
  const { items, hasNextPage, loadMore } = usePagedRow(row);
  return (
    <HorizontalRow title={row.title} onNearEnd={hasNextPage ? loadMore : undefined} itemCount={items.length}>
      {items.map((item, index) => (
        <div key={item.id} className="flex-shrink-0 w-[7.5rem] md:w-[10.5rem] snap-start">
          <PosterCard
            item={item}
            badge={item.airedEpisode ? `EP ${item.airedEpisode.episode}` : undefined}
            rank={row.kind === "trending" ? index + 1 : undefined}
          />
        </div>
      ))}
    </HorizontalRow>
  );
}

/** Home for computers and phones: the same sections as the TV home, in the same order */
export function WebHome({ rows }: { rows: CatalogRow[] }) {
  const router = useRouter();
  const history = useWatchHistory();
  const remote = useRemoteLibrary();
  const myList = useMyList();
  const resume = useMemo(
    () => mergeContinueWatching(continueWatching(history), remote, myList),
    [history, remote, myList]
  );

  return (
    <div className="max-w-[1360px] mx-auto pb-10">
      <header className="md:hidden flex items-center justify-between h-16 px-4">
        <span className="flex items-center gap-2.5">
          <Hanko className="w-9 h-9 text-base" />
          <span lang="ja" aria-hidden="true" className="text-xs font-black tracking-[0.3em] text-zinc-400">
            アニメ
          </span>
        </span>
        <AccountAvatar />
      </header>

      {rows.length === 0 ? (
        <div className="px-4 md:px-8 py-16">
          <h1 className="text-2xl font-bold">No se pudo cargar el catálogo</h1>
          <p className="mt-2 text-zinc-400">AniList no responde. Vuelve a intentarlo en unos segundos.</p>
          <button
            type="button"
            onClick={() => router.refresh()}
            className="mt-6 h-11 px-6 rounded-full bg-red-500 text-black font-bold hover:bg-red-400"
          >
            Reintentar
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-8 md:gap-11 md:pt-7">
          <Featured row={rows[0]} resume={resume} />
          {resume.length > 0 && (
            <HorizontalRow title="Seguir viendo">
              {resume.map((entry, index) => (
                <ResumeCard key={entry.anime.id} entry={entry} current={index === 0} />
              ))}
            </HorizontalRow>
          )}
          {rows.map((row, index) => (
            <Fragment key={row.id}>
              <CatalogRowSection row={row} />
              {/* Right after the first row (Tendencias), as in the design; computers and tablets */}
              {index === 0 && <TodayAiring className="hidden md:block" />}
            </Fragment>
          ))}
        </div>
      )}
    </div>
  );
}
