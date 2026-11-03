"use client";

import { useRef, useState } from "react";
import type { FocusDetails } from "@noriginmedia/norigin-spatial-navigation";
import type { CatalogItem, CatalogRow } from "@/lib/anilist/types";
import { AnimeCard } from "./anime-card";
import { FocusGroup, isPointerFocus } from "./focusable";
import { scrollToPosition } from "@/lib/tv/scroll";

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
  progress?: number;
  onSelect: () => void;
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
  /** Lets the screen scroll this row into place */
  onRowFocus?: (rowNode: HTMLElement) => void;
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
    if (rowRef.current) onRowFocus?.(rowRef.current);
    // The focused card takes the place of the first one, like on most TV apps. Waits a frame
    // so the cards mounted above are laid out, or the browser clamps to the old width.
    requestAnimationFrame(() => {
      const scroller = scrollerRef.current;
      const firstCard = scroller?.firstElementChild?.firstElementChild as HTMLElement | null;
      scrollToPosition(scroller, { left: node.offsetLeft - (firstCard?.offsetLeft ?? 0) });
    });
  };

  return (
    <section ref={rowRef} className="pt-2">
      <h2 className="pl-12 text-2xl font-bold text-zinc-100">{title}</h2>
      <FocusGroup focusKey={`row:${rowKey}`}>
        <div ref={scrollerRef} className="relative overflow-x-auto overflow-y-hidden tv-no-scrollbar">
          <div className="flex py-5 pl-12 pr-[40vw]">
            {cards.slice(0, renderCount).map((card, index) => (
              <AnimeCard
                key={card.key || card.item.id}
                focusKey={`${rowKey}:${card.key || card.item.id}`}
                item={card.item}
                badge={card.badge}
                progress={card.progress}
                onSelect={card.onSelect}
                onFocused={(node, details) => handleFocus(index, card.item, node, details)}
                className="mr-5"
              />
            ))}
          </div>
        </div>
      </FocusGroup>
    </section>
  );
}
