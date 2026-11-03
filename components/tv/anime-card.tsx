"use client";

import type { FocusDetails } from "@noriginmedia/norigin-spatial-navigation";
import type { CatalogItem } from "@/lib/anilist/types";
import { useTvFocusable } from "./focusable";
import { cn } from "@/lib/utils";
import { useIsTv } from "@/components/ui-mode";
import { PosterCard } from "@/components/web/poster-card";

interface AnimeCardProps {
  item: CatalogItem;
  focusKey?: string;
  onSelect: () => void;
  onFocused?: (node: HTMLElement, details: FocusDetails) => void;
  /** Short label over the cover, e.g. "EP 5" */
  badge?: string;
  /** 0–1; draws a progress bar along the bottom */
  progress?: number;
  /** Landscape card with the artwork and two lines of text under it, for "Seguir viendo" */
  wide?: { title: string; meta: string };
  className?: string;
}

export function AnimeCard(props: AnimeCardProps) {
  const isTv = useIsTv();
  if (isTv) return <TvAnimeCard {...props} />;
  const { item, onSelect, badge, progress } = props;
  return <PosterCard item={item} onSelect={onSelect} badge={badge} progress={progress} />;
}

function TvAnimeCard({ item, focusKey, onSelect, onFocused, badge, progress, wide, className }: AnimeCardProps) {
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
            "relative w-full h-[12.4rem] rounded-xl overflow-hidden bg-zinc-900 transition-transform duration-150",
            focused && "scale-105 ring-[0.25rem] ring-white shadow-[0_0.75rem_2rem_rgba(0,0,0,0.6)]"
          )}
          style={item.color ? { backgroundColor: item.color } : undefined}
        >
          {image && <img src={image} alt="" loading="lazy" decoding="async" className="w-full h-full object-cover" />}
          {progress !== undefined && progress > 0 && (
            <div className="absolute left-0 right-0 bottom-0 h-1.5 bg-white/25">
              <div className="h-full bg-red-600" style={{ width: `${Math.round(progress * 100)}%` }} />
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
      className={cn("relative flex-shrink-0 w-[11rem] h-[15.5rem] cursor-pointer outline-none", className)}
    >
      <div
        className={cn(
          "relative w-full h-full rounded-xl overflow-hidden bg-zinc-900 transition-transform duration-150",
          focused && "scale-105 ring-[0.25rem] ring-white shadow-[0_0.75rem_2rem_rgba(0,0,0,0.6)]"
        )}
        style={item.color ? { backgroundColor: item.color } : undefined}
      >
        {item.cover ? (
          <img src={item.cover} alt="" loading="lazy" decoding="async" className="w-full h-full object-cover" />
        ) : (
          <div className="flex items-end w-full h-full p-3 text-lg font-bold leading-tight">{item.title}</div>
        )}
        {badge && (
          <span className="absolute top-2 left-2 px-2 py-0.5 rounded-md bg-black/80 text-sm font-bold uppercase">
            {badge}
          </span>
        )}
        {progress !== undefined && progress > 0 && (
          <div className="absolute left-0 right-0 bottom-0 h-1.5 bg-white/25">
            <div className="h-full bg-red-600" style={{ width: `${Math.round(progress * 100)}%` }} />
          </div>
        )}
      </div>
    </div>
  );
}
