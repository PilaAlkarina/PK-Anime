"use client";

import Link from "next/link";
import type { CatalogItem } from "@/lib/anilist/types";
import { ScoreFrame, ScorePill, ScoreShine, flairOf } from "@/components/tv/list-styles";
import { cn } from "@/lib/utils";
import { RankNumeral } from "@/components/brand";

/** Cover with the title under it; the web layout's card for grids and rows */
export function PosterCard({
  item,
  href,
  onSelect,
  badge,
  badgeClassName,
  score,
  progress,
  meta,
  rank,
  className,
}: {
  item: CatalogItem;
  /** Where the card leads; defaults to the anime's page */
  href?: string;
  onSelect?: () => void;
  badge?: string;
  /** Colors for the badge (a list status); a dark pill by default */
  badgeClassName?: string;
  /** The viewer's own score: shown in the corner, with a glowing frame for 9 and 10 */
  score?: number | null;
  progress?: number;
  meta?: string;
  /** Trending rank, drawn as an outlined numeral in the cover's bottom-left corner */
  rank?: number;
  className?: string;
}) {
  return (
    <Link
      href={href ?? `/anime/${item.id}`}
      onClick={
        onSelect
          ? (e) => {
              e.preventDefault();
              onSelect();
            }
          : undefined
      }
      className={cn("group flex flex-col gap-2 min-w-0 outline-none", className)}
    >
      {/* The frame for 9 and 10 sits behind the cover; hover and keyboard focus pop the cover
          out like a comic panel ("koma") */}
      {/* A framed cover casts a hard shadow below: keep it off the title */}
      <div className={cn("relative", flairOf(score) && "mb-2")}>
        <ScoreFrame
          score={score}
          // Follows the cover's koma pop on hover and keyboard focus
          className="group-hover:-translate-x-[3px] group-hover:-translate-y-[3px] group-focus-visible:-translate-x-[3px] group-focus-visible:-translate-y-[3px] md:group-hover:-translate-x-1 md:group-hover:-translate-y-1 md:group-focus-visible:-translate-x-1 md:group-focus-visible:-translate-y-1"
        />
        <div
          className="relative pt-[141%] rounded-xl overflow-hidden cover-fill transition duration-200 group-hover:koma-sm md:group-hover:koma-md group-focus-visible:koma-sm md:group-focus-visible:koma-md"
          style={item.color ? ({ "--cover-color": item.color } as React.CSSProperties) : undefined}
        >
          {item.cover ? (
            <img
              src={item.cover}
              alt=""
              loading="lazy"
              decoding="async"
              className="absolute top-0 left-0 w-full h-full object-cover"
            />
          ) : (
            <span className="absolute top-0 left-0 flex items-end w-full h-full p-3 font-bold leading-tight">{item.title}</span>
          )}
          <ScoreShine score={score} />
          {badge && (
            <span
              className={cn(
                "absolute top-2 left-2 px-2 py-0.5 rounded-md text-xs font-bold uppercase",
                badgeClassName ?? "bg-black/80"
              )}
            >
              {badge}
            </span>
          )}
          {/* Bottom corner: on phone-width covers the status badge takes the whole top */}
          <ScorePill score={score} className="top-auto bottom-2 px-1.5 py-1 text-xs" />
          {rank !== undefined && (
            <RankNumeral rank={rank} className="left-1.5 -bottom-1.5 text-[3.25rem] md:left-2 md:-bottom-2 md:text-[4.5rem]" />
          )}
          {progress !== undefined && progress > 0 && (
            <div className="absolute left-0 right-0 bottom-0 h-1 bg-white/[0.18]">
              <div className="h-full bg-red-500" style={{ width: `${Math.round(progress * 100)}%` }} />
            </div>
          )}
        </div>
      </div>
      <span className="text-sm font-semibold leading-snug line-clamp-2 group-hover:text-white text-zinc-100">
        {item.title}
      </span>
      {meta && <span className="-mt-1.5 text-xs text-zinc-400">{meta}</span>}
    </Link>
  );
}
