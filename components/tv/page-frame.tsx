"use client";

import { createContext, useContext, useEffect, useRef, useState, type RefObject } from "react";
import type { FocusDetails } from "@noriginmedia/norigin-spatial-navigation";
import type { CatalogItem } from "@/lib/anilist/types";
import { revealVertically } from "@/lib/tv/scroll";
import { AnimeCard } from "./anime-card";
import { FocusGroup, Screen, isPointerFocus } from "./focusable";
import { cn } from "@/lib/utils";
import { useIsTv } from "@/components/ui-mode";
import { PosterCard } from "@/components/web/poster-card";
import { LoadMore } from "@/components/web/load-more";

const ScrollContainerContext = createContext<RefObject<HTMLDivElement> | null>(null);

/** True after the first client render, once localStorage-backed stores have their values */
export function useMounted() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return mounted;
}

/** Scrolls the nearest ScrollArea so a focused element is fully visible; ignores pointer focus */
export function useRevealOnFocus(margin = 48) {
  const containerRef = useContext(ScrollContainerContext);
  return (node: HTMLElement, details?: FocusDetails) => {
    if (!isPointerFocus(details)) revealVertically(containerRef?.current, node, margin);
  };
}

/** A scrollable region that focusables inside it reveal themselves in */
export function ScrollArea({ className, children }: { className?: string; children: React.ReactNode }) {
  const isTv = useIsTv();
  const containerRef = useRef<HTMLDivElement>(null);
  // The web layout scrolls the page itself
  if (!isTv) return <div className={className}>{children}</div>;
  return (
    <ScrollContainerContext.Provider value={containerRef}>
      <div ref={containerRef} className={cn("overflow-y-auto overflow-x-hidden tv-no-scrollbar", className)}>
        {children}
      </div>
    </ScrollContainerContext.Provider>
  );
}

/** Full-height page next to the rail, with a title and its own scroll area */
export function PageFrame({
  title,
  subtitle,
  ready,
  children,
}: {
  title: string;
  subtitle?: string;
  ready?: boolean;
  children: React.ReactNode;
}) {
  const isTv = useIsTv();
  if (!isTv) {
    return (
      <div className="max-w-[1360px] mx-auto px-4 pt-6 pb-12 md:px-8 md:pt-10">
        <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight">{title}</h1>
        {subtitle && <p className="mt-2 max-w-3xl text-[0.95rem] leading-relaxed text-zinc-400">{subtitle}</p>}
        <div className="mt-8">{children}</div>
      </div>
    );
  }

  return (
    <Screen ready={ready}>
      <ScrollArea className="fixed top-0 bottom-0 left-[7rem] right-0">
        <div className="px-12 pt-[8vh] pb-[20vh]">
          <h1 className="text-5xl font-bold">{title}</h1>
          {subtitle && <p className="mt-3 text-xl text-zinc-400">{subtitle}</p>}
          <div className="mt-10">{children}</div>
        </div>
      </ScrollArea>
    </Screen>
  );
}

export interface GridCard {
  item: CatalogItem;
  key?: string;
  badge?: string;
  badgeClassName?: string;
  /** The viewer's own score, see AnimeCard */
  score?: number | null;
}

/** Wrapping grid of covers; asks for more items when focus reaches the last rows */
export function CardGrid({
  cards,
  onSelect,
  onNearEnd,
  emptyMessage,
}: {
  cards: GridCard[];
  onSelect: (item: CatalogItem) => void;
  onNearEnd?: () => void;
  emptyMessage?: string;
}) {
  const isTv = useIsTv();
  const reveal = useRevealOnFocus();

  if (cards.length === 0) {
    return emptyMessage ? <p className="text-lg text-zinc-400 tv:text-2xl">{emptyMessage}</p> : null;
  }

  if (!isTv) {
    return (
      <>
        <div className="grid grid-cols-3 gap-x-3 gap-y-6 sm:grid-cols-[repeat(auto-fill,minmax(10rem,1fr))] sm:gap-x-5">
          {cards.map((card) => (
            <PosterCard
              key={card.key || card.item.id}
              item={card.item}
              badge={card.badge}
              badgeClassName={card.badgeClassName}
              score={card.score}
              onSelect={() => onSelect(card.item)}
            />
          ))}
        </div>
        {/* Remounted per page, so a marker still on screen after loading asks again */}
        {onNearEnd && <LoadMore key={cards.length} onVisible={onNearEnd} />}
      </>
    );
  }

  return (
    <FocusGroup className="grid grid-cols-[repeat(auto-fill,11rem)] gap-x-5 gap-y-8">
      {cards.map((card, index) => (
        <AnimeCard
          key={card.key || card.item.id}
          item={card.item}
          badge={card.badge}
          badgeClassName={card.badgeClassName}
          score={card.score}
          onSelect={() => onSelect(card.item)}
          onFocused={(node, details) => {
            reveal(node, details);
            if (index >= cards.length - 10) onNearEnd?.();
          }}
        />
      ))}
    </FocusGroup>
  );
}
