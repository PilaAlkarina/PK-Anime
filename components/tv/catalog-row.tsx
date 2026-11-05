"use client";

import { JapaneseLabel } from "@/components/brand";
import { Fragment, useRef, useState } from "react";
import { Info, type LucideIcon } from "lucide-react";
import type { FocusDetails } from "@noriginmedia/norigin-spatial-navigation";
import type { CatalogItem, CatalogRow } from "@/lib/anilist/types";
import { AnimeCard } from "./anime-card";
import { FocusGroup, isPointerFocus, useTvFocusable } from "./focusable";
import { scrollToPosition } from "@/lib/tv/scroll";
import { cn } from "@/lib/utils";

// Cards are mounted progressively as focus moves along the row, which keeps the first
// render (and the images it loads) small on slow TVs
const INITIAL_CARDS = 12;
const CARDS_AHEAD = 10;
const LOAD_MORE_THRESHOLD = 5;

export interface RowCard {
  item: CatalogItem;
  /** Unique within the row; defaults to the anime ID */
  key?: string;
  badge?: string;
  badgeClassName?: string;
  progress?: number;
  /** Episode drawn as a big numeral on wide cards */
  episode?: number;
  /** Position in a trending row, drawn beside the cover */
  rank?: number;
  /** Landscape card with text under it (see AnimeCard) */
  wide?: { title: string; meta: string };
  onSelect: () => void;
  /**
   * More actions in buttons under the card, reached with Down: on "Seguir viendo", where OK
   * plays, they open the anime page or take it off the row
   */
  actions?: RowCardAction[];
}

export interface RowCardAction {
  label: string;
  /** Info by default */
  icon?: LucideIcon;
  onSelect: () => void;
}

/** A button under a card for one of its actions */
function CardAction({
  label,
  icon: Icon = Info,
  onSelect,
  onFocused,
}: RowCardAction & { onFocused: (node: HTMLElement, details: FocusDetails) => void }) {
  const { ref, focused, pointerProps } = useTvFocusable({
    onSelect,
    onFocus: (layout, _props, details) => onFocused(layout.node, details),
  });
  return (
    <button
      ref={ref}
      type="button"
      {...pointerProps}
      className={cn(
        "flex items-center mr-3 h-10 px-4 rounded-full text-lg outline-none transition-transform duration-150",
        focused ? "bg-white text-black scale-105" : "bg-white/10 text-zinc-300"
      )}
    >
      <Icon className="w-5 h-5 mr-2" />
      {label}
    </button>
  );
}

function dedupe(items: CatalogItem[]) {
  const seen = new Set<number>();
  return items.filter((item) => !seen.has(item.id) && !!seen.add(item.id));
}

/** Paged catalog row: fetches the next page from /api/catalog/row near its end */
export function usePagedRow(initial: CatalogRow) {
  const [items, setItems] = useState(() => dedupe(initial.items));
  const [page, setPage] = useState(initial.page);
  const [hasNextPage, setHasNextPage] = useState(initial.hasNextPage);
  const loadingRef = useRef(false);

  const loadMore = async () => {
    if (!hasNextPage || loadingRef.current) return;
    loadingRef.current = true;
    try {
      const params = new URLSearchParams({ kind: initial.kind, page: String(page + 1) });
      if (initial.value) params.set("value", initial.value);
      const res = await fetch(`/api/catalog/row?${params}`);
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      setItems((prev) => dedupe([...prev, ...data.row.items]));
      setPage(data.row.page);
      setHasNextPage(data.row.hasNextPage);
    } catch {
      // Keep what we have; the next focus near the end retries
    } finally {
      loadingRef.current = false;
    }
  };

  return { items, hasNextPage, loadMore };
}

export function CardRow({
  rowKey,
  title,
  cards,
  onCardFocus,
  onRowFocus,
  onNearEnd,
}: {
  rowKey: string;
  title: string;
  cards: RowCard[];
  onCardFocus?: (item: CatalogItem) => void;
  /** Lets the screen scroll this row into place; returns true when it scrolled */
  onRowFocus?: (rowNode: HTMLElement) => boolean | void;
  onNearEnd?: () => void;
}) {
  const rowRef = useRef<HTMLElement>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [renderCount, setRenderCount] = useState(INITIAL_CARDS);

  const handleFocus = (index: number, item: CatalogItem, node: HTMLElement, details: FocusDetails) => {
    setRenderCount((n) => Math.max(n, index + CARDS_AHEAD));
    if (index >= cards.length - LOAD_MORE_THRESHOLD) onNearEnd?.();
    onCardFocus?.(item);
    // Pointer focus must not move things under the cursor
    if (isPointerFocus(details)) return;
    const scrolledPage = rowRef.current ? onRowFocus?.(rowRef.current) === true : false;
    // The focused card takes the place of the first one, like on most TV apps. Waits a frame
    // so the cards mounted above are laid out, or the browser clamps to the old width. When
    // the page is already animating, this one jumps: Chromium cancels concurrent smooth scrolls.
    requestAnimationFrame(() => {
      const scroller = scrollerRef.current;
      const firstCard = scroller?.firstElementChild?.firstElementChild as HTMLElement | null;
      scrollToPosition(
        scroller,
        { left: node.offsetLeft - (firstCard?.offsetLeft ?? 0) },
        scrolledPage ? "auto" : "smooth"
      );
    });
  };

  return (
    <section ref={rowRef} className="pt-2">
      <h2 className="pl-12 text-3xl text-white">
        {title}
        <JapaneseLabel title={title} />
      </h2>
      <FocusGroup focusKey={`row:${rowKey}`}>
        <div ref={scrollerRef} className="relative overflow-x-auto overflow-y-hidden tv-no-scrollbar">
          <div className="flex py-5 pl-12 pr-[40vw]">
            {cards.slice(0, renderCount).map((card, index) => {
              const key = card.key || card.item.id;
              const onFocused = (node: HTMLElement, details: FocusDetails) => handleFocus(index, card.item, node, details);
              const animeCard = (
                <AnimeCard
                  focusKey={`${rowKey}:${key}`}
                  item={card.item}
                  badge={card.badge}
                  badgeClassName={card.badgeClassName}
                  progress={card.progress}
                  episode={card.episode}
                  rank={card.rank}
                  wide={card.wide}
                  onSelect={card.onSelect}
                  onFocused={onFocused}
                  className={card.actions?.length ? undefined : "mr-5"}
                />
              );
              if (!card.actions?.length) return <Fragment key={key}>{animeCard}</Fragment>;
              // Card and buttons share a column, so Down from the card lands on its own buttons
              return (
                <FocusGroup key={key} className="flex flex-col flex-shrink-0 mr-5">
                  {animeCard}
                  <div className="flex mt-3">
                    {card.actions.map((action) => (
                      <CardAction key={action.label} {...action} onFocused={onFocused} />
                    ))}
                  </div>
                </FocusGroup>
              );
            })}
          </div>
        </div>
      </FocusGroup>
    </section>
  );
}
