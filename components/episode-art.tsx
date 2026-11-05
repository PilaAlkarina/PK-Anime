import type { CatalogItem } from "@/lib/anilist/types";
import { cn } from "@/lib/utils";

export type EpisodeArtFallback = Pick<CatalogItem, "banner" | "cover">;

/**
 * An episode tile's artwork: its own thumbnail, or else the series' banner, or else its cover.
 * The stand-ins are darkened, so real thumbnails still stand out and the numeral reads on top;
 * the cover is portrait, so it's cropped from the top and softened. `className` goes last and
 * wins (the locked tiles grey it further).
 */
export function EpisodeArt({
  thumbnail,
  fallback,
  className,
}: {
  thumbnail?: string | null;
  fallback: EpisodeArtFallback;
  className?: string;
}) {
  const kind = thumbnail ? "episode" : fallback.banner ? "banner" : fallback.cover ? "cover" : null;
  if (!kind) return null;
  const src = thumbnail || fallback.banner || fallback.cover!;
  return (
    <img
      src={src}
      alt=""
      loading="lazy"
      decoding="async"
      className={cn(
        "absolute top-0 left-0 w-full h-full object-cover",
        // Darkened rather than faded: the tile behind is tinted with the cover color
        kind === "banner" && "brightness-[0.55]",
        kind === "cover" && "object-top blur-[2px] scale-110 brightness-[0.45]",
        className
      )}
    />
  );
}
