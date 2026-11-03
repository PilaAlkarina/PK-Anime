"use client";

import type { FocusDetails } from "@noriginmedia/norigin-spatial-navigation";
import type { CatalogItem } from "@/lib/anilist/types";
import { useTvFocusable } from "./focusable";
import { cn } from "@/lib/utils";

export function AnimeCard({
  item,
  focusKey,
  onSelect,
  onFocused,
  badge,
  progress,
  className,
}: {
  item: CatalogItem;
  focusKey?: string;
  onSelect: () => void;
  onFocused?: (node: HTMLElement, details: FocusDetails) => void;
  /** Short label over the cover, e.g. "EP 5" */
  badge?: string;
  /** 0–1; draws a progress bar along the bottom */
  progress?: number;
  className?: string;
}) {
  const { ref, focused, pointerProps } = useTvFocusable({
    focusKey,
    onSelect,
    onFocus: (layout, _props, details) => onFocused?.(layout.node, details),
  });

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
