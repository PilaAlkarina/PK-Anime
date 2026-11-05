"use client";

import { useRef } from "react";
import { Music } from "lucide-react";
import type { FocusDetails } from "@noriginmedia/norigin-spatial-navigation";
import { JapaneseLabel } from "@/components/brand";
import { themeArtists, themeLabel, type AnimeTheme } from "@/lib/library/themes";
import { scrollToPosition } from "@/lib/tv/scroll";
import { FocusGroup, isPointerFocus, useTvFocusable } from "./focusable";
import { cn } from "@/lib/utils";

export const THEMES_TITLE = "Openings y endings";

function ThemeTile({
  theme,
  onSelect,
  onFocused,
}: {
  theme: AnimeTheme;
  onSelect: () => void;
  onFocused: (node: HTMLElement, details: FocusDetails) => void;
}) {
  const { ref, focused, pointerProps } = useTvFocusable({
    onSelect,
    onFocus: (layout, _props, details) => onFocused(layout.node, details),
  });
  return (
    <div
      ref={ref}
      {...pointerProps}
      className={cn(
        "relative flex-shrink-0 w-[22rem] h-[9.5rem] mr-5 p-5 rounded-xl border-2 cursor-pointer transition-transform duration-150",
        focused ? "bg-white text-black border-white koma" : "bg-zinc-900 border-zinc-800 text-white"
      )}
    >
      <div className="flex items-center">
        <span className={cn("font-display text-3xl", focused ? "text-red-500" : "text-zinc-400")}>{themeLabel(theme)}</span>
        {theme.episodes && (
          <span className={cn("ml-3 text-lg", focused ? "text-zinc-600" : "text-zinc-500")}>Ep. {theme.episodes}</span>
        )}
        {theme.spoiler && (
          <span className="ml-auto px-2 py-0.5 rounded-md bg-amber-400 text-black text-sm font-bold">Spoiler</span>
        )}
      </div>
      <p className="mt-2 text-2xl font-bold line-clamp-1">{theme.title || "Sin título"}</p>
      <p className={cn("mt-1 text-lg line-clamp-1", focused ? "text-zinc-700" : "text-zinc-400")}>{themeArtists(theme)}</p>
      <Music className={cn("absolute right-5 bottom-5 w-6 h-6", focused ? "text-zinc-500" : "text-zinc-700")} />
    </div>
  );
}

/** The anime page's openings and endings on TV: a row of tiles, OK plays from that one */
export function ThemesRow({
  themes,
  onPlay,
  onRowFocus,
}: {
  themes: AnimeTheme[];
  onPlay: (index: number) => void;
  onRowFocus?: (node: HTMLElement) => void;
}) {
  const rowRef = useRef<HTMLElement>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);

  const onFocused = (node: HTMLElement, details: FocusDetails) => {
    if (isPointerFocus(details)) return;
    if (rowRef.current) onRowFocus?.(rowRef.current);
    const first = scrollerRef.current?.firstElementChild?.firstElementChild as HTMLElement | null;
    scrollToPosition(scrollerRef.current, { left: node.offsetLeft - (first?.offsetLeft ?? 0) });
  };

  return (
    <section ref={rowRef} className="pt-2">
      <h2 className="pl-12 text-3xl text-white">
        {THEMES_TITLE}
        <JapaneseLabel title={THEMES_TITLE} />
      </h2>
      <FocusGroup focusKey="row:themes">
        <div ref={scrollerRef} className="relative overflow-x-auto overflow-y-hidden tv-no-scrollbar">
          <div className="flex py-5 pl-12 pr-[40vw]">
            {themes.map((theme, index) => (
              <ThemeTile key={theme.id} theme={theme} onSelect={() => onPlay(index)} onFocused={onFocused} />
            ))}
          </div>
        </div>
      </FocusGroup>
    </section>
  );
}
