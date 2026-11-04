"use client";

import type { FocusDetails } from "@noriginmedia/norigin-spatial-navigation";
import type { CatalogItem } from "@/lib/anilist/types";
import { useTvFocusable } from "./focusable";
import { cn } from "@/lib/utils";
import { useIsTv } from "@/components/ui-mode";
import { PosterCard } from "@/components/web/poster-card";
import { ScoreFrame, ScorePill, ScoreShine } from "./list-styles";
import { EpisodeNumeral, RankNumeral } from "@/components/brand";

interface AnimeCardProps {
  item: CatalogItem;
  focusKey?: string;
  onSelect: () => void;
  onFocused?: (node: HTMLElement, details: FocusDetails) => void;
  /** Short label over the cover, e.g. "EP 5" */
  badge?: string;
  /** Colors for the badge (a list status); a dark pill by default */
  badgeClassName?: string;
  /** The viewer's own score: shown in the corner, with a glowing frame for 9 and 10 */
  score?: number | null;
  /** 0–1; draws a progress bar along the bottom */
  progress?: number;
  /** Wide cards: the episode, as a big numeral in the corner */
  episode?: number;
  /** Trending rank, as an outlined numeral overlapping the cover's bottom-left corner */
  rank?: number;
  /** Landscape card with the artwork and two lines of text under it, for "Seguir viendo" */
  wide?: { title: string; meta: string };
  className?: string;
}

export function AnimeCard(props: AnimeCardProps) {
  const isTv = useIsTv();
  if (isTv) return <TvAnimeCard {...props} />;
  const { item, onSelect, badge, badgeClassName, score, progress, rank } = props;
  return (
    <PosterCard
      item={item}
      onSelect={onSelect}
      badge={badge}
      badgeClassName={badgeClassName}
      score={score}
      progress={progress}
      rank={rank}
    />
  );
}

function TvAnimeCard({
  item,
  focusKey,
  onSelect,
  onFocused,
  badge,
  badgeClassName,
  score,
  progress,
  episode,
  rank,
  wide,
  className,
}: AnimeCardProps) {
  const { ref, focused, pointerProps } = useTvFocusable({
    focusKey,
    onSelect,
    onFocus: (layout, _props, details) => onFocused?.(layout.node, details),
  });

  if (wide) {
    const image = item.banner || item.cover;
    return (
      <div
        ref={ref}
        {...pointerProps}
        title={item.title}
        className={cn("relative flex-shrink-0 w-[22rem] cursor-pointer outline-none", className)}
      >
        <div
          className={cn(
            "relative w-full h-[12.4rem] rounded-xl overflow-hidden cover-fill transition-transform duration-150",
            focused && "koma"
          )}
          style={item.color ? ({ "--cover-color": item.color } as React.CSSProperties) : undefined}
        >
          {image && <img src={image} alt="" loading="lazy" decoding="async" className="relative w-full h-full object-cover" />}
          {episode !== undefined && (
            <EpisodeNumeral n={episode} current={focused} className="top-2.5 left-3.5 text-[2.5rem]" />
          )}
          {progress !== undefined && progress > 0 && (
            <div className="absolute left-0 right-0 bottom-0 h-1.5 bg-white/[0.18]">
              <div className="h-full bg-red-500" style={{ width: `${Math.round(progress * 100)}%` }} />
            </div>
          )}
        </div>
        <p className={cn("mt-4 text-xl font-bold line-clamp-1", focused ? "text-white" : "text-zinc-200")}>{wide.title}</p>
        <p className="mt-1 text-lg text-zinc-400">{wide.meta}</p>
      </div>
    );
  }

  return (
    <div
      ref={ref}
      {...pointerProps}
      title={item.title}
      className={cn(
        "relative flex-shrink-0 w-[11rem] h-[15.5rem] cursor-pointer outline-none",
        // Room for the rank numeral, which hangs off the cover's left edge
        rank !== undefined && "ml-[2.1rem]",
        className
      )}
    >
      <ScoreFrame score={score} focused={focused} />
      <div
        className={cn(
          "relative w-full h-full rounded-xl overflow-hidden cover-fill transition-transform duration-150",
          focused && "koma"
        )}
        style={item.color ? ({ "--cover-color": item.color } as React.CSSProperties) : undefined}
      >
        {item.cover ? (
          <img src={item.cover} alt="" loading="lazy" decoding="async" className="relative w-full h-full object-cover" />
        ) : (
          <div className="relative flex items-end w-full h-full p-3 text-lg font-bold leading-tight">{item.title}</div>
        )}
        <ScoreShine score={score} />
        {badge && (
          <span
            className={cn(
              "absolute top-2 left-2 px-2 py-0.5 rounded-md text-sm font-bold uppercase",
              badgeClassName ?? "bg-black/80"
            )}
          >
            {badge}
          </span>
        )}
        <ScorePill score={score} className="px-2 py-1 text-sm" />
        {progress !== undefined && progress > 0 && (
          <div className="absolute left-0 right-0 bottom-0 h-1.5 bg-white/[0.18]">
            <div className="h-full bg-red-500" style={{ width: `${Math.round(progress * 100)}%` }} />
          </div>
        )}
      </div>
      {rank !== undefined && (
        <RankNumeral rank={rank} current={focused} size="tv" className="-left-[2.4rem] -bottom-3.5 text-[6.5rem]" />
      )}
    </div>
  );
}
