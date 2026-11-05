"use client";

import { useEffect, useState } from "react";
import type { CatalogItem } from "@/lib/anilist/types";
import { useSynopsis } from "@/lib/library/synopsis";
import { metaLine } from "@/lib/library/format";
import { GENRE_LABELS } from "@/lib/anilist/genres";
import { cn } from "@/lib/utils";
import { MetaWithScore, Stamp } from "@/components/brand";

/** Genres as bordered pills, the TV size */
export function GenrePills({ genres, className }: { genres: string[]; className?: string }) {
  return (
    <div className={cn("flex flex-wrap", className)}>
      {genres.map((g) => (
        <span
          key={g}
          className="mr-2.5 mb-2 px-4 py-1 rounded-full border-[1.5px] border-line bg-zinc-900 text-lg font-medium text-zinc-200"
        >
          {GENRE_LABELS[g] || g}
        </span>
      ))}
    </div>
  );
}

interface ArtLayer {
  src: string;
  banner: boolean;
  /** Loaded and faded in */
  shown: boolean;
}

/** Fade time of the hero art; the previous layer is dropped once the new one is fully in */
const ART_FADE_MS = 700;

/**
 * The focused anime's art with a crossfade: the new image is added on top, invisible, and once it
 * has loaded it fades in while the previous one fades out (a banner and a cover don't cover each
 * other, so the old one can't just wait underneath); the old one is removed after that. Moving
 * fast along a row never shows the empty background.
 */
function HeroArt({ item }: { item: CatalogItem }) {
  const src = item.banner || item.cover;
  const [layers, setLayers] = useState<ArtLayer[]>([]);

  useEffect(() => {
    if (!src) {
      setLayers((current) => current.map((l) => ({ ...l, shown: false })));
      return;
    }
    setLayers((current) => {
      const existing = current.find((l) => l.src === src);
      // Back to an image still on screen: bring it to the front as it is
      if (existing) return [...current.filter((l) => l !== existing && l.shown), existing];
      // Keep what is visible under the newcomer; images that never got to load are dropped
      return [...current.filter((l) => l.shown).slice(-1), { src, banner: Boolean(item.banner), shown: false }];
    });
  }, [src, item.banner]);

  // Once the top layer is in, the ones under it go
  useEffect(() => {
    const top = layers[layers.length - 1];
    if (!top?.shown || layers.length === 1) return;
    const timer = setTimeout(() => setLayers((current) => current.slice(-1)), ART_FADE_MS);
    return () => clearTimeout(timer);
  }, [layers]);

  // Two frames later, so the browser has painted the layer invisible first: a cached image is
  // ready as soon as it mounts, and showing it right away would skip the fade
  const reveal = (layerSrc: string) =>
    requestAnimationFrame(() =>
      requestAnimationFrame(() =>
        setLayers((current) =>
          current.some((l) => l.src === layerSrc && !l.shown)
            ? current.map((l) => (l.src === layerSrc ? { ...l, shown: true } : l))
            : current
        )
      )
    );

  const top = layers[layers.length - 1];
  return (
    <>
      {layers.map((layer) => {
        // The newest shows once loaded; the ones under it stay until then, then fade out
        const isTop = layer === top;
        const visible = isTop ? layer.shown : !top?.shown;
        const img = (
          <img
            src={layer.src}
            alt=""
            decoding="async"
            onLoad={() => reveal(layer.src)}
            // Cached images may finish before React listens
            ref={(el) => {
              if (el?.complete && el.naturalWidth) reveal(layer.src);
            }}
            className={cn(
              layer.banner ? "w-full h-full object-cover object-top" : "absolute top-[7vh] right-[8rem] h-[42vh] rounded-xl tv-cover-shadow"
            )}
          />
        );
        return (
          <div
            key={layer.src}
            aria-hidden="true"
            className={cn(
              "absolute transition-[opacity,transform] ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none",
              layer.banner ? "top-0 left-0 right-0 h-[24vw] overflow-hidden" : "inset-0",
              visible ? "opacity-100 scale-100" : "opacity-0",
              // Banners settle from a slight zoom; covers only fade, as scaling would shift them
              !visible && isTop && layer.banner && "scale-[1.03]"
            )}
            style={{ transitionDuration: `${ART_FADE_MS}ms` }}
          >
            {/* AniList banners are about 1900×400; a box close to that shape keeps them sharp and whole */}
            {img}
            {layer.banner && <div className="absolute left-0 right-0 bottom-0 h-1/2 bg-gradient-to-t from-black to-transparent" />}
          </div>
        );
      })}
    </>
  );
}

/** Top half of the home screen: artwork and details of the focused anime */
export function Hero({
  item,
  rank = 0,
  rowIds,
}: {
  item: CatalogItem | null;
  /** Place in the trending row, 0 for none */
  rank?: number;
  /** The IDs of the row the item is in: their synopses come in the same request */
  rowIds?: number[];
}) {
  const synopsis = useSynopsis(item?.id ?? null, { batch: rowIds });
  if (!item) return null;

  return (
    <div className="fixed top-0 left-0 right-0 h-[56vh] overflow-hidden bg-black">
      <HeroArt item={item} />
      <div
        className={cn(
          // One shade for banners and covers, so it doesn't jump between them
          "absolute top-0 bottom-0 left-0 w-[70%] bg-gradient-to-r from-black via-black/80 to-transparent"
        )}
      />
      <div
        aria-hidden="true"
        className="absolute top-0 bottom-0 left-[20%] w-[55%] screentone [mask-image:linear-gradient(90deg,transparent,#000_45%,transparent)]"
      />
      <div className="absolute left-0 right-0 bottom-0 h-[45%] bg-gradient-to-t from-black to-transparent" />

      <div key={item.id} className="relative pl-[10rem] pt-[8vh] w-[58%] featured-in">
        {rank > 0 && (
          <Stamp japanese={`人気 No.${rank}`} className="mb-4 text-base">
            TENDENCIA N.º {rank}
          </Stamp>
        )}
        <h1 className="text-[4rem] leading-[1.1] line-clamp-2">{item.title}</h1>
        <p className="mt-4 text-xl font-medium text-zinc-200">
          <MetaWithScore before={metaLine(item, { score: false })} score={item.score} />
        </p>
        {item.genres.length > 0 && <GenrePills genres={item.genres.slice(0, 4)} className="mt-3" />}
        <p className="mt-5 text-xl leading-relaxed text-zinc-200 line-clamp-3 min-h-[5.6rem]">
          {synopsis}
        </p>
      </div>
    </div>
  );
}
