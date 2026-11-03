"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Bookmark, BookmarkCheck, ChevronLeft, ChevronRight, Play } from "lucide-react";
import type { CatalogItem, CatalogRow } from "@/lib/anilist/types";
import { GENRE_LABELS } from "@/lib/anilist/genres";
import { metaLine } from "@/lib/library/format";
import { continueWatching, useWatchHistory, type ContinueItem } from "@/lib/library/history";
import { isInMyList, toggleMyList, useMyList } from "@/lib/library/my-list";
import { mergeContinueWatching, useRemoteLibrary } from "@/lib/library/remote";
import { usePagedRow } from "@/components/tv/catalog-row";
import { useAnimeDetail } from "@/components/tv/hero";
import { HorizontalRow } from "./horizontal-row";
import { PosterCard } from "./poster-card";
import { AccountAvatar } from "./web-shell";
import { cn } from "@/lib/utils";

const FEATURED_COUNT = 5;

/** The first row's leading titles, one at a time; arrows and dots move between them */
function Featured({ row, resume }: { row: CatalogRow; resume: ContinueItem[] }) {
  const items = row.items.slice(0, FEATURED_COUNT);
  const [index, setIndex] = useState(0);
  const myList = useMyList();
  const item = items[index];
  const detail = useAnimeDetail(item?.id ?? null, 0);
  if (!item) return null;

  const resumeEntry = resume.find((r) => r.anime.id === item.id);
  const episode = resumeEntry?.episode ?? 1;
  const inMyList = isInMyList(myList, item.id);
  const image = item.banner || item.cover;
  const genres = item.genres
    .slice(0, 3)
    .map((g) => GENRE_LABELS[g] || g)
    .join(", ");
  const step = (by: number) => setIndex((i) => (i + by + items.length) % items.length);

  return (
    <section aria-label="Destacado" aria-roledescription="carrusel" className="px-4 md:px-8">
      <div className="relative overflow-hidden rounded-2xl md:rounded-3xl bg-zinc-900 md:min-h-[27rem] md:flex md:items-end">
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
          <span className="absolute top-3 left-3 md:hidden px-2.5 py-1 rounded-full bg-black/80 text-[0.7rem] font-bold tracking-widest text-red-300">
            {row.title.toUpperCase()} · N.º {index + 1}
          </span>
        </div>

        <div key={item.id} className="hidden md:flex relative flex-col gap-3 max-w-[40rem] p-10 tv-fade-in">
          <span className="text-xs font-bold tracking-[0.14em] text-red-300">
            {row.title.toUpperCase()} · N.º {index + 1}
          </span>
          <h1 className="text-[2.6rem] leading-[1.08] font-extrabold tracking-tight line-clamp-2">{item.title}</h1>
          <p className="text-[0.95rem] text-zinc-300">{[metaLine(item), genres].filter(Boolean).join(" · ")}</p>
          <p className="text-[0.95rem] leading-relaxed text-zinc-300 line-clamp-3 min-h-[4.5rem]">{detail?.description}</p>
          <FeaturedActions item={item} episode={episode} resuming={!!resumeEntry} inMyList={inMyList} />
        </div>

        {items.length > 1 && (
          <div className="absolute right-3 bottom-3 md:right-6 md:bottom-6 flex items-center gap-2">
            <button
              type="button"
              aria-label="Destacado anterior"
              onClick={() => step(-1)}
              className="flex items-center justify-center w-9 h-9 md:w-10 md:h-10 rounded-full bg-black/70 hover:bg-black"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <button
              type="button"
              aria-label="Destacado siguiente"
              onClick={() => step(1)}
              className="flex items-center justify-center w-9 h-9 md:w-10 md:h-10 rounded-full bg-black/70 hover:bg-black"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>
        )}
      </div>

      {/* Phones: details under the artwork, buttons full width */}
      <div key={`m-${item.id}`} className="md:hidden flex flex-col gap-3 mt-3">
        <div>
          <h1 className="text-[1.4rem] leading-tight font-extrabold line-clamp-2">{item.title}</h1>
          <p className="mt-1 text-sm text-zinc-400">{metaLine(item)}</p>
        </div>
        <FeaturedActions item={item} episode={episode} resuming={!!resumeEntry} inMyList={inMyList} compact />
        <div className="flex justify-center gap-1.5" aria-hidden>
          {items.map((it, i) => (
            <span
              key={it.id}
              className={cn("h-1.5 rounded-full transition-all", i === index ? "w-5 bg-white" : "w-1.5 bg-white/40")}
            />
          ))}
        </div>
      </div>
    </section>
  );
}

function FeaturedActions({
  item,
  episode,
  resuming,
  inMyList,
  compact = false,
}: {
  item: CatalogItem;
  episode: number;
  resuming: boolean;
  inMyList: boolean;
  compact?: boolean;
}) {
  return (
    <div className={cn("flex items-center gap-2.5", !compact && "mt-2")}>
      <Link
        href={`/watch/${item.id}/${episode}`}
        className={cn(
          "flex items-center justify-center gap-2 rounded-full bg-white text-black font-bold hover:bg-zinc-200",
          compact ? "flex-1 h-12 rounded-xl" : "h-12 px-6"
        )}
      >
        <Play className="w-4 h-4" fill="currentColor" />
        {resuming ? `Continuar EP ${episode}` : `Ver episodio ${episode}`}
      </Link>
      {!compact && (
        <Link
          href={`/anime/${item.id}`}
          className="flex items-center h-12 px-5 rounded-full bg-white/15 font-semibold hover:bg-white/25"
        >
          Más información
        </Link>
      )}
      <button
        type="button"
        onClick={() => toggleMyList(item)}
        aria-pressed={inMyList}
        aria-label={inMyList ? "Quitar de Mi lista" : "Añadir a Mi lista"}
        className={cn(
          "flex items-center justify-center w-12 h-12 flex-shrink-0 bg-white/15 hover:bg-white/25",
          compact ? "rounded-xl" : "rounded-full"
        )}
      >
        {inMyList ? <BookmarkCheck className="w-5 h-5" /> : <Bookmark className="w-5 h-5" />}
      </button>
    </div>
  );
}

/** Wide card for "Seguir viendo": artwork, the episode and how far it got */
function ResumeCard({ entry }: { entry: ContinueItem }) {
  const { anime, episode, progress } = entry;
  const image = anime.banner || anime.cover;
  return (
    <Link
      href={`/watch/${anime.id}/${episode}`}
      className="group flex-shrink-0 w-[15rem] md:w-[19rem] snap-start flex flex-col gap-2 outline-none"
    >
      <div
        className="relative pt-[56.25%] rounded-xl overflow-hidden bg-zinc-900 group-focus-visible:ring-2 group-focus-visible:ring-white"
        style={anime.color ? { backgroundColor: anime.color } : undefined}
      >
        {image && (
          <img src={image} alt="" loading="lazy" decoding="async" className="absolute top-0 left-0 w-full h-full object-cover" />
        )}
        <span className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 flex items-center justify-center w-11 h-11 rounded-full bg-black/70 opacity-90 group-hover:opacity-100 group-hover:scale-110 transition-transform">
          <Play className="w-4 h-4 ml-0.5" fill="currentColor" />
        </span>
        {progress > 0 && (
          <div className="absolute left-0 right-0 bottom-0 h-1 bg-white/25">
            <div className="h-full bg-red-600" style={{ width: `${Math.round(progress * 100)}%` }} />
          </div>
        )}
      </div>
      <span className="text-sm font-semibold line-clamp-1">{anime.title}</span>
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
      {items.map((item) => (
        <div key={item.id} className="flex-shrink-0 w-[7.5rem] md:w-[10.5rem] snap-start">
          <PosterCard item={item} badge={item.airedEpisode ? `EP ${item.airedEpisode.episode}` : undefined} />
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
  const resume = useMemo(() => mergeContinueWatching(continueWatching(history), remote), [history, remote]);

  return (
    <div className="max-w-[1360px] mx-auto pb-10">
      <header className="md:hidden flex items-center justify-between h-16 px-4">
        <span className="text-xl font-extrabold tracking-tight">PK Anime</span>
        <AccountAvatar />
      </header>

      {rows.length === 0 ? (
        <div className="px-4 md:px-8 py-16">
          <h1 className="text-2xl font-bold">No se pudo cargar el catálogo</h1>
          <p className="mt-2 text-zinc-400">AniList no responde. Vuelve a intentarlo en unos segundos.</p>
          <button
            type="button"
            onClick={() => router.refresh()}
            className="mt-6 h-11 px-6 rounded-full bg-white text-black font-semibold hover:bg-zinc-200"
          >
            Reintentar
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-8 md:gap-11 md:pt-7">
          <Featured row={rows[0]} resume={resume} />
          {resume.length > 0 && (
            <HorizontalRow title="Seguir viendo">
              {resume.map((entry) => (
                <ResumeCard key={entry.anime.id} entry={entry} />
              ))}
            </HorizontalRow>
          )}
          {rows.map((row) => (
            <CatalogRowSection key={row.id} row={row} />
          ))}
        </div>
      )}
    </div>
  );
}
