import { CalendarClock, RadioTower } from "lucide-react";
import type { CatalogItem, RowKind } from "@/lib/anilist/types";
import { cn } from "@/lib/utils";

/**
 * Corner seal on a cover, a small square hanko like the PK logo: a broadcast antenna in the
 * accent for a show on air, the premiere day ("19 / NOV", or a calendar while it has no date) for
 * one not out yet. The icon and the date say it, so the theme's colors don't have to be learned.
 * Both states come with the card itself, so no list needs another request.
 */

type AiringState = { kind: "airing" } | { kind: "upcoming"; date: string | null };

const premiereDay = new Intl.DateTimeFormat("es", { day: "numeric", month: "short" });

export function airingState(item: Pick<CatalogItem, "status" | "nextEpisode">): AiringState | null {
  if (item.status === "RELEASING") return { kind: "airing" };
  if (item.status !== "NOT_YET_RELEASED") return null;
  // Only the first episode's date is the premiere; a later one means AniList is behind
  const first = item.nextEpisode?.episode === 1 ? item.nextEpisode : null;
  return { kind: "upcoming", date: first ? premiereDay.format(new Date(first.airingAt * 1000)).replace(".", "") : null };
}

/** Whether a card shows the seal: `"dated"` only when it has a premiere date */
export type AiringMode = boolean | "dated";

/**
 * Rows where every show is on air already say so in their title ("En emisión", "Últimos
 * episodios"); in "Próximos estrenos" only a premiere date adds anything.
 */
export const rowShowsAiring = (kind: RowKind): AiringMode =>
  kind === "airing" || kind === "latest" ? false : kind === "upcoming" ? "dated" : true;

export function AiringTag({
  item,
  tv,
  belowBadge,
  datedOnly,
  className,
}: {
  item: Pick<CatalogItem, "status" | "nextEpisode">;
  /** TV sizes */
  tv?: boolean;
  /** A badge holds the top left: on phone-width covers the seal moves down, out of its way */
  belowBadge?: boolean;
  /** Nothing for a show that isn't dated (on air, or coming with no date) */
  datedOnly?: boolean;
  className?: string;
}) {
  const state = airingState(item);
  if (!state || (datedOnly && (state.kind === "airing" || !state.date))) return null;
  const label = state.kind === "airing" ? "En emisión" : state.date ? `Se estrena el ${state.date}` : "Próximamente";
  const [day, month] = state.kind === "upcoming" && state.date ? state.date.split(" ") : [];

  return (
    <span
      title={label}
      aria-label={label}
      className={cn(
        // A square seal turned like the PK hanko: an antenna on air, the premiere day coming soon
        "absolute right-2 flex flex-col items-center justify-center rounded-[22%] -rotate-6",
        "font-black uppercase text-center leading-none",
        tv ? "top-2 w-[2.6rem] h-[2.6rem]" : "w-7 h-7 md:w-8 md:h-8",
        !tv && (belowBadge ? "top-9 md:top-2" : "top-2"),
        state.kind === "airing"
          ? "bg-red-500 text-black shadow-[inset_0_0_0_0.15em_rgba(var(--c-ink),0.18)]"
          : "bg-black/85 text-amber-400 shadow-[inset_0_0_0_0.14em_currentColor]",
        className
      )}
    >
      {state.kind === "airing" ? (
        <RadioTower aria-hidden className={tv ? "w-6 h-6" : "w-4 h-4 md:w-[1.15rem] md:h-[1.15rem]"} />
      ) : day ? (
        <>
          <span aria-hidden className={tv ? "text-[1.05rem]" : "text-[0.75rem] md:text-[0.8125rem]"}>{day}</span>
          <span aria-hidden className={cn("mt-[0.1em]", tv ? "text-[0.6rem]" : "text-[0.5rem] md:text-[0.5625rem]")}>{month}</span>
        </>
      ) : (
        <CalendarClock aria-hidden className={tv ? "w-6 h-6" : "w-4 h-4 md:w-[1.15rem] md:h-[1.15rem]"} />
      )}
    </span>
  );
}
