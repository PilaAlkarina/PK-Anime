"use client";

import { useEffect, useState } from "react";
import type { AnimeDetail, CatalogItem } from "@/lib/anilist/types";
import { metaLine } from "@/lib/library/format";
import { GENRE_LABELS } from "@/lib/anilist/genres";
import { cn } from "@/lib/utils";

const details = new Map<number, AnimeDetail>();

/** Full details for the hero's synopsis; cached for the session and fetched after a short pause */
export function useAnimeDetail(id: number | null, delayMs = 300) {
  const [detail, setDetail] = useState<AnimeDetail | null>(id ? details.get(id) ?? null : null);

  useEffect(() => {
    if (!id) return setDetail(null);
    const cached = details.get(id);
    if (cached) return setDetail(cached);
    setDetail(null);
    const ctrl = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const data = await (await fetch(`/api/catalog/anime/${id}`, { signal: ctrl.signal })).json();
        if (!data.success) return;
        details.set(id, data.anime);
        setDetail(data.anime);
      } catch {}
    }, delayMs);
    return () => {
      clearTimeout(timer);
      ctrl.abort();
    };
  }, [id, delayMs]);

  return detail;
}

/** Top half of the home screen: artwork and details of the focused anime */
export function Hero({ item }: { item: CatalogItem | null }) {
  const detail = useAnimeDetail(item?.id ?? null);
  if (!item) return null;

  return (
    <div className="fixed top-0 left-0 right-0 h-[56vh] overflow-hidden bg-black">
      {item.banner ? (
        // AniList banners are about 1900×400; a box close to that shape keeps them sharp and whole
        <div className="absolute top-0 left-0 right-0 h-[24vw] overflow-hidden">
          <img
            key={item.banner}
            src={item.banner}
            alt=""
            decoding="async"
            className="w-full h-full object-cover object-top tv-fade-in"
          />
          <div className="absolute left-0 right-0 bottom-0 h-1/2 bg-gradient-to-t from-black to-transparent" />
        </div>
      ) : (
        item.cover && (
          <img
            key={item.cover}
            src={item.cover}
            alt=""
            decoding="async"
            className="absolute top-[7vh] right-[8rem] h-[42vh] rounded-xl tv-cover-shadow tv-fade-in"
          />
        )
      )}
      <div
        className={cn(
          "absolute top-0 bottom-0 left-0 w-[70%] bg-gradient-to-r from-black to-transparent",
          item.banner ? "via-black/70" : "via-black/85"
        )}
      />
      <div
        aria-hidden="true"
        className="absolute top-0 bottom-0 left-[20%] w-[55%] screentone [mask-image:linear-gradient(90deg,transparent,#000_45%,transparent)]"
      />
      <div className="absolute left-0 right-0 bottom-0 h-[45%] bg-gradient-to-t from-black to-transparent" />

      <div key={item.id} className="relative pl-[10rem] pt-[9vh] w-[58%] tv-fade-in">
        <h1 className="text-5xl font-bold leading-tight line-clamp-2">{item.title}</h1>
        <p className="mt-4 text-xl text-zinc-300">{metaLine(item)}</p>
        {item.genres.length > 0 && (
          <p className="mt-2 text-lg text-zinc-400">
            {item.genres.slice(0, 4).map((g) => GENRE_LABELS[g] || g).join(" · ")}
          </p>
        )}
        <p className="mt-5 text-xl leading-relaxed text-zinc-300 line-clamp-3 min-h-[5.6rem]">
          {detail?.description}
        </p>
      </div>
    </div>
  );
}
