"use client";

import { EpisodeNumeral, Hanko, MetaWithScore, Stamp, japaneseFor } from "@/components/brand";
import { Fragment, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Bookmark, BookmarkCheck, ChevronLeft, ChevronRight, Info, Play, X } from "lucide-react";
import type { CatalogItem, CatalogRow } from "@/lib/anilist/types";
import { GENRE_LABELS } from "@/lib/anilist/genres";
import { metaLine } from "@/lib/library/format";
import type { ContinueItem } from "@/lib/library/history";
import { hideFromContinueWatching, newEpisodesBadge, useContinueRows } from "@/lib/library/continue";
import { becauseTitle, useBecauseYouWatched } from "@/lib/library/recommendations";
import { findLocalEntry, removeLocalEntry, toggleMyList, useMyList } from "@/lib/library/my-list";
import { findRemoteEntry, REMOTE_STATUS_LABELS, useRemoteLibrary } from "@/lib/library/remote";
import { addToRemote, removeFromRemote } from "@/lib/library/sync";
import { usePagedRow } from "@/components/tv/catalog-row";
import { useSynopsis } from "@/lib/library/synopsis";
import { HorizontalRow } from "./horizontal-row";
import { PosterCard } from "./poster-card";
import { TodayAiring } from "./today-airing";
import { AccountAvatar } from "./web-shell";
import { cn } from "@/lib/utils";

const FEATURED_COUNT = 5;
/** Time each featured title stays before the carousel moves on */
const ROTATE_MS = 8000;

// The art fades into the ink fill instead of under a dark overlay: two layers clipped at the same
// rounded corner let the bright art show through as a thin arc
const FADE_MASK =
  "md:[mask-image:linear-gradient(90deg,rgb(0_0_0/0.05),rgb(0_0_0/0.25)_36%,#000_72%)] md:[-webkit-mask-image:linear-gradient(90deg,rgb(0_0_0/0.05),rgb(0_0_0/0.25)_36%,#000_72%)]";

/**
 * The first row's leading titles as a carousel: it moves on by itself every few seconds (a bar
 * fills up until then), crossfading the art. Hovering it or focusing inside it holds it; with
 * reduced motion it only moves with the arrows.
 */
function Featured({ row, resume }: { row: CatalogRow; resume: ContinueItem[] }) {
  const items = row.items.slice(0, FEATURED_COUNT);
  const [index, setIndex] = useState(0);
  const [hovered, setHovered] = useState(false);
  const [focusInside, setFocusInside] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const item = items[index];
  // All the carousel's synopses in one request, so each is there when it moves on
  const synopsis = useSynopsis(item?.id ?? null, { batch: items.map((i) => i.id), delayMs: 0 });

  // Reduced motion: no autoplay, only the arrows
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) setReducedMotion(true);
  }, []);

  if (!item) return null;

  const rotating = items.length > 1;
  const paused = reducedMotion || hovered || focusInside;
  const resumeEntry = resume.find((r) => r.anime.id === item.id);
  const episode = resumeEntry?.episode ?? 1;
  const genres = item.genres
    .slice(0, 3)
    .map((g) => GENRE_LABELS[g] || g)
    .join(", ");
  const step = (by: number) => setIndex((i) => (i + by + items.length) % items.length);
  const stampLabel = row.kind === "trending" ? `TENDENCIA N.º ${index + 1}` : `${row.title.toUpperCase()} · N.º ${index + 1}`;
  const stampJapanese = japaneseFor(row.title) ? `${japaneseFor(row.title)} No.${index + 1}` : undefined;

  // The bar that fills up until the next title; its animation's end moves the carousel. Keyed by
  // index, so a manual move restarts it
  const progress = (className: string) => (
    <span
      key={index}
      className={cn("block h-full bg-red-500 origin-left featured-progress", paused && "[animation-play-state:paused]", className)}
      style={{ animationDuration: `${ROTATE_MS}ms` }}
      onAnimationEnd={() => step(1)}
    />
  );

  return (
    <section
      aria-label="Destacado"
      aria-roledescription="carrusel"
      className="px-4 md:px-8"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocus={() => setFocusInside(true)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setFocusInside(false);
      }}
    >
      <div className="relative overflow-hidden rounded-[18px] cover-fill md:[--cover-color:rgb(var(--c-ink))] md:min-h-[27rem] md:flex md:items-end">
        <div className="relative pt-[56.25%] md:pt-0 md:absolute md:top-0 md:left-0 md:w-full md:h-full">
          {/* Every title's art stays mounted and stacked, so moving on is a real crossfade with a
              slow settle, never a flash of the empty fill */}
          {items.map((it, i) => {
            const art = it.banner || it.cover;
            if (!art) return null;
            const active = i === index;
            return (
              <img
                key={it.id}
                src={art}
                alt=""
                aria-hidden={!active}
                decoding="async"
                className={cn(
                  "absolute top-0 left-0 w-full h-full object-cover transition-[opacity,transform] duration-[900ms] ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none",
                  active ? "opacity-100 scale-100" : "opacity-0 scale-[1.04]",
                  FADE_MASK,
                  !it.banner && "md:object-contain md:object-right md:bg-zinc-900"
                )}
              />
            );
          })}
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
          {rotating && (
            // Phones: the active dot is the bar
            <div className="md:hidden absolute left-0 right-0 bottom-3 flex justify-center gap-1.5" aria-hidden>
              {items.map((it, i) => (
                <span
                  key={it.id}
                  className={cn(
                    "h-1.5 rounded-full overflow-hidden transition-all",
                    i === index ? "w-[22px] bg-white/30" : "w-1.5 bg-white/45"
                  )}
                >
                  {i === index && progress("md:hidden")}
                </span>
              ))}
            </div>
          )}
        </div>

        <div key={item.id} className="hidden md:flex relative flex-col gap-3 max-w-[40rem] p-10 featured-in">
          <Stamp japanese={stampJapanese} className="text-[13px]">
            {stampLabel}
          </Stamp>
          <h1 className="text-[2.6rem] leading-[1.1] line-clamp-2">{item.title}</h1>
          <p className="text-[0.95rem] font-medium text-zinc-200">
            <MetaWithScore before={metaLine(item, { score: false })} score={item.score} after={genres} />
          </p>
          <p className="text-[0.95rem] leading-relaxed text-zinc-200 line-clamp-3 min-h-[4.5rem]">{synopsis}</p>
          <FeaturedActions item={item} episode={episode} resuming={!!resumeEntry} />
        </div>

        {rotating && (
          <div className="absolute right-3 bottom-3 md:right-6 md:bottom-6 flex items-center gap-2">
            {/* Computers: one segment per title, the current one filling up until the next */}
            <div className="hidden md:flex items-center gap-1.5 mr-2" aria-hidden>
              {items.map((it, i) => (
                <span
                  key={it.id}
                  className={cn("w-7 h-1 rounded-full overflow-hidden", i < index ? "bg-white/70" : "bg-white/25")}
                >
                  {i === index && progress("hidden md:block")}
                </span>
              ))}
            </div>
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
      <div key={`m-${item.id}`} className="md:hidden flex flex-col gap-3 mt-3 featured-in">
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
function ResumeCard({ entry, current = false, badge }: { entry: ContinueItem; current?: boolean; badge?: string }) {
  const { anime, episode, progress } = entry;
  const image = anime.banner || anime.cover;
  return (
    // The card plays; the ⓘ over the artwork opens the anime page instead, and the ✕ takes it off
    // the row (both always shown on phones, which have no hover)
    <div className="group relative flex-shrink-0 w-[15rem] md:w-[19rem] snap-start">
      <Link href={`/watch/${anime.id}/${episode}`} className="group/play flex flex-col gap-2 outline-none">
        <div
          data-cover
          className={cn(
            "relative pt-[56.25%] rounded-xl overflow-hidden cover-fill transition duration-200 ease-out",
            "group-hover:koma-sm md:group-hover:koma-md group-focus-visible/play:koma-sm md:group-focus-visible/play:koma-md",
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
          {badge && (
            <span className="absolute bottom-2 left-2.5 md:left-3 px-2 py-0.5 rounded-md bg-red-500 text-black text-[0.7rem] font-bold uppercase">
              {badge}
            </span>
          )}
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
      <Link
        href={`/anime/${anime.id}`}
        aria-label={`Ficha de ${anime.title}`}
        title="Ver ficha"
        className={cn(
          "absolute top-2 right-2 flex items-center justify-center w-9 h-9 rounded-full bg-black/75 text-white",
          "transition-opacity hover:bg-black focus-visible:outline focus-visible:outline-2 focus-visible:outline-white",
          "md:opacity-0 md:group-hover:opacity-100 md:focus-visible:opacity-100"
        )}
      >
        <Info className="w-[1.1rem] h-[1.1rem]" />
      </Link>
      <button
        type="button"
        onClick={() => hideFromContinueWatching(anime.id)}
        aria-label={`Quitar ${anime.title} de esta fila`}
        title="Quitar de la fila"
        className={cn(
          "absolute top-2 right-12 flex items-center justify-center w-9 h-9 rounded-full bg-black/75 text-white",
          "transition-opacity hover:bg-black focus-visible:outline focus-visible:outline-2 focus-visible:outline-white",
          "md:opacity-0 md:group-hover:opacity-100 md:focus-visible:opacity-100"
        )}
      >
        <X className="w-[1.1rem] h-[1.1rem]" />
      </button>
    </div>
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
  // Caught-up shows with a new episode out get their own row, under "Seguir viendo"
  const { newEpisodes, resume } = useContinueRows();
  const resumable = useMemo(() => [...resume, ...newEpisodes], [newEpisodes, resume]);
  const because = useBecauseYouWatched();

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
          <Featured row={rows[0]} resume={resumable} />
          {resume.length > 0 && (
            <HorizontalRow title="Seguir viendo">
              {resume.map((entry, index) => (
                <ResumeCard key={entry.anime.id} entry={entry} current={index === 0} />
              ))}
            </HorizontalRow>
          )}
          {newEpisodes.length > 0 && (
            <HorizontalRow title="Nuevos episodios">
              {newEpisodes.map((entry) => (
                <ResumeCard key={entry.anime.id} entry={entry} badge={newEpisodesBadge(entry.newCount)} />
              ))}
            </HorizontalRow>
          )}
          {rows.map((row, index) => (
            <Fragment key={row.id}>
              <CatalogRowSection row={row} />
              {/* Right after the first row (Tendencias), as in the design; computers and tablets */}
              {index === 0 && <TodayAiring className="hidden md:block" />}
              {index === 0 &&
                because.map(({ seed, items }) => (
                  <HorizontalRow key={seed.id} title={becauseTitle(seed)} itemCount={items.length}>
                    {items.map((item) => (
                      <div key={item.id} className="flex-shrink-0 w-[7.5rem] md:w-[10.5rem] snap-start">
                        <PosterCard item={item} />
                      </div>
                    ))}
                  </HorizontalRow>
                ))}
            </Fragment>
          ))}
        </div>
      )}
    </div>
  );
}
