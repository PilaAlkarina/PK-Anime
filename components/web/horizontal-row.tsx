"use client";

import { JapaneseLabel } from "@/components/brand";
import { useRef } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { LoadMore } from "./load-more";

/** Titled row that scrolls sideways: swipe on touch, arrow buttons with a mouse */
export function HorizontalRow({
  title,
  action,
  onNearEnd,
  itemCount,
  children,
}: {
  title: string;
  /** Link shown next to the title, e.g. "Ver todo" */
  action?: React.ReactNode;
  onNearEnd?: () => void;
  /** Number of items, so the end marker re-arms after each page */
  itemCount?: number;
  children: React.ReactNode;
}) {
  const scrollerRef = useRef<HTMLDivElement>(null);

  const scrollBy = (direction: 1 | -1) => {
    const scroller = scrollerRef.current;
    if (scroller) scroller.scrollBy({ left: direction * scroller.clientWidth * 0.85, behavior: "smooth" });
  };

  return (
    <section>
      <div className="flex items-center justify-between gap-4 px-4 mb-3 md:px-8 md:mb-4">
        <h2 className="text-lg md:text-[1.35rem] font-bold">
          {title}
          <JapaneseLabel title={title} />
        </h2>
        <div className="flex items-center gap-2">
          {action}
          <button
            type="button"
            aria-label={`Anteriores en ${title}`}
            onClick={() => scrollBy(-1)}
            className="hidden md:flex items-center justify-center w-9 h-9 rounded-full bg-ink-3 border-[1.5px] border-line text-white hover:bg-zinc-800"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <button
            type="button"
            aria-label={`Siguientes en ${title}`}
            onClick={() => scrollBy(1)}
            className="hidden md:flex items-center justify-center w-9 h-9 rounded-full bg-ink-3 border-[1.5px] border-line text-white hover:bg-zinc-800"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>
      </div>
      {/* A sideways scroller clips vertically too, so it gets room above and below for the
          hovered card's lift, shadow and score glow; the negative margins keep the spacing */}
      <div
        ref={scrollerRef}
        className="flex gap-3 md:gap-4 overflow-x-auto overscroll-x-contain snap-x snap-mandatory scroll-px-4 md:scroll-px-8 px-4 md:px-8 pt-5 pb-7 -mt-5 -mb-5 tv-no-scrollbar"
      >
        {children}
        {onNearEnd && <LoadMore key={itemCount} onVisible={onNearEnd} root={scrollerRef} className="w-px flex-shrink-0" />}
      </div>
    </section>
  );
}
