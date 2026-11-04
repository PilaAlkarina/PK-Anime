import { Sparkles, Star } from "lucide-react";
import type { ListStatus } from "@/lib/trackers/types";
import { cn } from "@/lib/utils";

/**
 * Colors for list statuses (MyAnimeList's own scheme: green watching, blue completed, amber
 * on hold, red dropped, grey planned) and the flair on cards scored 9 and 10. The class names
 * live here, under components/, because Tailwind only scans components/ and app/.
 */
export const STATUS_STYLES: Record<ListStatus | "local", { dot: string; badge: string }> = {
  watching: { dot: "bg-emerald-400", badge: "bg-emerald-600 text-white" },
  planning: { dot: "bg-slate-400", badge: "bg-slate-600 text-white" },
  completed: { dot: "bg-blue-400", badge: "bg-blue-600 text-white" },
  paused: { dot: "bg-amber-400", badge: "bg-amber-400 text-black" },
  dropped: { dot: "bg-red-500", badge: "bg-red-600 text-white" },
  local: { dot: "bg-white", badge: "bg-white text-black" },
};

export function StatusDot({ status, className }: { status: ListStatus | "local"; className?: string }) {
  return <span className={cn("inline-block flex-shrink-0 rounded-full", STATUS_STYLES[status].dot, className)} />;
}

/** 9 and 10 get the flair; lower scores only a plain pill */
export const flairOf = (score: number | null | undefined) => (score === 10 ? 10 : score === 9 ? 9 : null);

/**
 * Frame just outside a card's cover (place it before the cover, in a relative parent): gold for
 * 9; for 10 a gold-pink-violet frame with a pulsing glow. Both cast a hard shadow down-right, so
 * the card needs room under the cover (see `flairOf`).
 */
export function ScoreFrame({
  score,
  focused,
  className,
}: {
  score: number | null | undefined;
  focused?: boolean;
  className?: string;
}) {
  const flair = flairOf(score);
  if (!flair) return null;
  // The frame lifts with the cover; its shadow stays, so it grows (see library.css)
  const move = cn("transition-transform duration-150", focused && "-translate-x-1 -translate-y-1", className);
  return (
    <>
      <div aria-hidden className={cn("pk-flair", flair === 10 ? "pk-flair-10-shadow" : "pk-flair-9-shadow")} />
      <div aria-hidden className={cn("pk-flair", flair === 10 ? "pk-flair-10" : "pk-flair-9", move)} />
    </>
  );
}

/** Light sweeping across the cover of a 10 (place it inside the cover, which clips it) */
export function ScoreShine({ score }: { score: number | null | undefined }) {
  return flairOf(score) === 10 ? <div aria-hidden className="pk-shine" /> : null;
}

/**
 * "★ 8", in the cover's corner or `inline` in text; gold for 9, iridescent with sparkles and a
 * sweeping shine for 10
 */
export function ScorePill({
  score,
  inline,
  className,
}: {
  score: number | null | undefined;
  inline?: boolean;
  className?: string;
}) {
  if (!score) return null;
  const flair = flairOf(score);
  const Icon = flair === 10 ? Sparkles : Star;
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md font-bold leading-none overflow-hidden",
        inline ? "relative align-middle" : "absolute top-2 right-2",
        flair === 10 ? "pk-pill-10" : flair === 9 ? "pk-pill-9" : inline ? "bg-white/10 text-white" : "bg-black/80 text-white",
        className
      )}
    >
      {inline && flair === 10 && <span aria-hidden className="pk-shine" />}
      <Icon className="w-[1em] h-[1em] mr-[0.25em]" fill={flair === 10 ? "none" : "currentColor"} />
      {score}
    </span>
  );
}
