"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Play, Search } from "lucide-react";
import type { FocusDetails } from "@noriginmedia/norigin-spatial-navigation";
import { JapaneseLabel } from "@/components/brand";
import { themeArtists, themeLabel } from "@/lib/library/themes";
import type { ThemeTrack } from "@/components/theme-player";
import { useIsTv } from "@/components/ui-mode";
import { FocusButton, FocusGroup, useTvFocusable } from "./focusable";
import { useRevealOnFocus } from "./page-frame";
import { cn } from "@/lib/utils";

export interface LibraryGroup {
  animeId: number;
  animeTitle: string;
  cover: string | null;
  tracks: ThemeTrack[];
}

export const LIBRARY_TITLE = "Biblioteca";
// Anime drawn at first and per "Ver más", so TVs don't build hundreds of rows at once
const GROUPS_PAGE = 24;

const normalize = (text: string) =>
  text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

/** One song: OK / click plays the library from it */
function ThemeLine({
  track,
  onPlay,
  onFocused,
}: {
  track: ThemeTrack;
  onPlay: () => void;
  onFocused: (node: HTMLElement, details?: FocusDetails) => void;
}) {
  const isTv = useIsTv();
  const { theme } = track;
  const { ref, focused, pointerProps } = useTvFocusable({
    onSelect: onPlay,
    onFocus: (layout, _props, details) => onFocused(layout.node, details),
  });
  const body = (on: boolean) => (
    <>
      <span
        className={cn(
          "shrink-0 font-display text-center",
          isTv ? "w-[4.5rem] text-2xl" : "w-12 text-base",
          on ? "text-red-500" : "text-zinc-400"
        )}
      >
        {themeLabel(theme)}
      </span>
      <span className="min-w-0 flex-1 text-left">
        <span className={cn("block font-bold truncate", isTv ? "text-xl" : "text-sm")}>{theme.title || "Sin título"}</span>
        <span className={cn("block truncate", isTv ? "text-lg" : "text-xs", on ? "text-zinc-600" : "text-zinc-400")}>
          {themeArtists(theme) || "Artista desconocido"}
          {theme.episodes ? ` · Ep. ${theme.episodes}` : ""}
        </span>
      </span>
      {theme.spoiler && (
        <span className={cn("shrink-0 ml-2 px-1.5 py-0.5 rounded-md bg-amber-400 text-black font-bold", isTv ? "text-sm" : "text-[10px]")}>
          Spoiler
        </span>
      )}
      <Play
        aria-hidden
        className={cn("shrink-0 ml-3 fill-current", isTv ? "w-6 h-6" : "w-4 h-4", on ? "text-red-500" : "text-zinc-600")}
      />
    </>
  );

  if (!isTv) {
    return (
      <button
        type="button"
        onClick={onPlay}
        className="group flex items-center w-full px-2 py-2 rounded-lg text-white outline-none hover:bg-white/[0.06] focus-visible:bg-white/[0.06] focus-visible:ring-2 focus-visible:ring-white"
      >
        {body(false)}
      </button>
    );
  }
  return (
    <div
      ref={ref}
      {...pointerProps}
      className={cn(
        "relative flex items-center px-3 py-3 rounded-xl border-2 cursor-pointer transition-transform duration-150",
        focused ? "z-10 bg-white text-black border-white koma" : "border-transparent text-white"
      )}
    >
      {body(focused)}
    </div>
  );
}

/**
 * The radio's library: every opening and ending it plays, by anime A–Z, to browse and start
 * from any song. The web layout adds a search over anime, song and artist.
 */
export function RadioLibrary({
  groups,
  onPlay,
}: {
  groups: LibraryGroup[];
  /** Plays `tracks` (the library as shown) from `index` */
  onPlay: (tracks: ThemeTrack[], index: number) => void;
}) {
  const isTv = useIsTv();
  const reveal = useRevealOnFocus(120);
  const [query, setQuery] = useState("");
  const [shown, setShown] = useState(GROUPS_PAGE);

  const visible = useMemo(() => {
    const q = normalize(query.trim());
    if (!q) return groups;
    return groups
      .map((group) =>
        normalize(group.animeTitle).includes(q)
          ? group
          : {
              ...group,
              tracks: group.tracks.filter(({ theme }) =>
                normalize(`${theme.title ?? ""} ${theme.artists.join(" ")}`).includes(q)
              ),
            }
      )
      .filter((group) => group.tracks.length > 0);
  }, [groups, query]);

  // The whole filtered library, in order, so playback carries on past the clicked anime
  const flat = useMemo(() => visible.flatMap((g) => g.tracks), [visible]);
  const offsets = useMemo(() => {
    let at = 0;
    return visible.map((g) => {
      const start = at;
      at += g.tracks.length;
      return start;
    });
  }, [visible]);

  const songs = flat.length;

  return (
    <section className="mt-12 tv:mt-16">
      <div className="flex flex-wrap items-end justify-between">
        <h2 className="mr-6 text-2xl text-white tv:text-3xl">
          {LIBRARY_TITLE}
          <JapaneseLabel title={LIBRARY_TITLE} />
        </h2>
        {!isTv && (
          <label className="relative block w-full mt-4 sm:mt-0 sm:w-80">
            <span className="sr-only">Buscar en la biblioteca</span>
            <Search aria-hidden className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
            <input
              type="search"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setShown(GROUPS_PAGE);
              }}
              placeholder="Anime, canción o artista"
              className="w-full h-11 pl-10 pr-4 rounded-full bg-ink-3 border-[1.5px] border-line text-sm text-white placeholder:text-zinc-500 outline-none focus:border-zinc-400"
            />
          </label>
        )}
      </div>
      <p className="mt-2 text-sm text-zinc-400 tv:text-xl">
        {songs} {songs === 1 ? "canción" : "canciones"} de {visible.length} {visible.length === 1 ? "anime" : "animes"}
        {isTv ? " · OK reproduce desde esa canción" : " · Elige una para que la radio empiece por ella"}
      </p>

      {visible.length === 0 ? (
        <p className="mt-6 text-base text-zinc-400 tv:text-2xl">
          {query ? `Nada coincide con «${query}».` : "Todavía no hay canciones cargadas."}
        </p>
      ) : (
        <FocusGroup focusKey="radio:library" className="flex flex-wrap mt-5 -mx-2 tv:mt-6">
          {visible.slice(0, shown).map((group, gi) => (
            <div key={group.animeId} className="w-full px-2 mb-4 md:w-1/2 2xl:w-1/3 tv:w-1/2 tv:mb-6">
              <div className="h-full p-3 rounded-2xl bg-zinc-950 border-[1.5px] border-line tv:p-4">
                <div className="flex items-center mb-2 tv:mb-3">
                  <div
                    className="relative shrink-0 w-10 h-14 mr-3 rounded-md overflow-hidden cover-fill tv:w-14 tv:h-20 tv:mr-4"
                  >
                    {group.cover && <img src={group.cover} alt="" loading="lazy" decoding="async" className="relative w-full h-full object-cover" />}
                  </div>
                  <div className="min-w-0">
                    {isTv ? (
                      <p className="text-2xl font-bold line-clamp-1">{group.animeTitle}</p>
                    ) : (
                      <Link href={`/anime/${group.animeId}`} className="block text-base font-bold line-clamp-1 hover:underline">
                        {group.animeTitle}
                      </Link>
                    )}
                    <p className="text-xs text-zinc-500 tv:text-lg">
                      {group.tracks.length} {group.tracks.length === 1 ? "canción" : "canciones"}
                    </p>
                  </div>
                </div>
                {group.tracks.map((track, ti) => (
                  <ThemeLine
                    key={track.theme.id}
                    track={track}
                    onPlay={() => onPlay(flat, offsets[gi] + ti)}
                    onFocused={reveal}
                  />
                ))}
              </div>
            </div>
          ))}
          {shown < visible.length && (
            <div className="w-full px-2">
              <FocusButton variant="secondary" onSelect={() => setShown((n) => n + GROUPS_PAGE)}>
                Ver más ({visible.length - shown} {visible.length - shown === 1 ? "anime" : "animes"})
              </FocusButton>
            </div>
          )}
        </FocusGroup>
      )}
    </section>
  );
}
