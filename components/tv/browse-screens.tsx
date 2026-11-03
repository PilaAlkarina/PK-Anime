"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { CatalogItem, CatalogRow, Genre, ScheduleEntry } from "@/lib/anilist/types";
import { formatTime, startOfDay } from "@/lib/library/format";
import { useMyList } from "@/lib/library/my-list";
import { usePagedRow } from "./catalog-row";
import { FocusButton, FocusGroup, useTvFocusable } from "./focusable";
import { CardGrid, PageFrame, useMounted, useRevealOnFocus } from "./page-frame";
import { cn } from "@/lib/utils";

function useOpenAnime() {
  const router = useRouter();
  return (item: CatalogItem) => router.push(`/anime/${item.id}`);
}

// Tile backgrounds cycle through these; plain gradients are cheap to paint on TVs
const GENRE_COLORS = [
  "from-rose-700 to-rose-950",
  "from-amber-600 to-amber-950",
  "from-emerald-700 to-emerald-950",
  "from-sky-700 to-sky-950",
  "from-violet-700 to-violet-950",
  "from-fuchsia-700 to-fuchsia-950",
  "from-teal-700 to-teal-950",
  "from-orange-700 to-orange-950",
];

function GenreTile({ genre, index }: { genre: Genre; index: number }) {
  const router = useRouter();
  const reveal = useRevealOnFocus();
  const { ref, focused, pointerProps } = useTvFocusable({
    onSelect: () => router.push(`/genres/${encodeURIComponent(genre.name)}`),
    onFocus: (layout, _props, details) => reveal(layout.node, details),
  });

  return (
    <div
      ref={ref}
      {...pointerProps}
      className={cn(
        "flex items-end h-32 p-6 rounded-2xl bg-gradient-to-br cursor-pointer outline-none transition-transform duration-150",
        GENRE_COLORS[index % GENRE_COLORS.length],
        focused && "scale-105 ring-[0.25rem] ring-white"
      )}
    >
      <span className="text-3xl font-bold">{genre.label}</span>
    </div>
  );
}

export function GenresScreen({ genres }: { genres: Genre[] }) {
  return (
    <PageFrame title="Géneros">
      {genres.length === 0 ? (
        <p className="text-2xl text-zinc-400">No se pudieron cargar los géneros.</p>
      ) : (
        <FocusGroup className="grid grid-cols-4 gap-6">
          {genres.map((genre, index) => (
            <GenreTile key={genre.name} genre={genre} index={index} />
          ))}
        </FocusGroup>
      )}
    </PageFrame>
  );
}

/** Every page of one catalog row as a grid, e.g. a genre */
export function RowGridScreen({ row, subtitle }: { row: CatalogRow; subtitle?: string }) {
  const openAnime = useOpenAnime();
  const { items, loadMore } = usePagedRow(row);
  return (
    <PageFrame title={row.title} subtitle={subtitle}>
      <CardGrid
        cards={items.map((item) => ({ item }))}
        onSelect={openAnime}
        onNearEnd={loadMore}
        emptyMessage="No hay nada aquí todavía."
      />
    </PageFrame>
  );
}

export function MyListScreen() {
  const openAnime = useOpenAnime();
  const mounted = useMounted();
  const list = useMyList();
  return (
    <PageFrame title="Mi lista" ready={mounted}>
      <CardGrid
        cards={list.map((item) => ({ item }))}
        onSelect={openAnime}
        emptyMessage="Todavía no has guardado nada. Añade series desde su ficha con «Mi lista»."
      />
    </PageFrame>
  );
}

const shortWeekday = new Intl.DateTimeFormat("es", { weekday: "short" });

function dayLabel(date: Date, index: number) {
  if (index === 0) return "Hoy";
  if (index === 1) return "Mañana";
  const name = shortWeekday.format(date).replace(".", "");
  return `${name.charAt(0).toUpperCase()}${name.slice(1)} ${date.getDate()}`;
}

/** Next seven days of episodes, in the viewer's time zone */
export function ScheduleScreen() {
  const openAnime = useOpenAnime();
  // Days depend on the viewer's clock and time zone, so they're only computed in the browser
  const mounted = useMounted();
  const days = useMemo(() => {
    if (!mounted) return [];
    const today = new Date();
    return Array.from(
      { length: 7 },
      (_, i) => new Date(today.getFullYear(), today.getMonth(), today.getDate() + i)
    );
  }, [mounted]);
  const [selected, setSelected] = useState(0);
  const [entries, setEntries] = useState<ScheduleEntry[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (days.length === 0) return;
    const from = Math.floor(days[0].getTime() / 1000);
    const to = Math.floor(new Date(days[6].getFullYear(), days[6].getMonth(), days[6].getDate() + 1).getTime() / 1000);
    const ctrl = new AbortController();
    fetch(`/api/catalog/schedule?from=${from}&to=${to}`, { signal: ctrl.signal })
      .then((res) => res.json())
      .then((data) => {
        if (!data.success) throw new Error(data.error);
        setEntries(data.entries);
      })
      .catch((err) => {
        if (err?.name !== "AbortError") setFailed(true);
      });
    return () => ctrl.abort();
  }, [days]);

  const dayStart = days[selected] ? startOfDay(days[selected]) : 0;
  const dayEntries = (entries || []).filter((e) => startOfDay(new Date(e.airingAt * 1000)) === dayStart);

  return (
    <PageFrame title="Calendario" subtitle="Episodios que se emiten esta semana, en tu hora local" ready={mounted}>
      <FocusGroup className="flex flex-wrap mb-10">
        {days.map((day, index) => (
          <FocusButton
            key={day.getTime()}
            variant="chip"
            className="mr-3 mb-3"
            active={index === selected}
            onSelect={() => setSelected(index)}
          >
            {dayLabel(day, index)}
          </FocusButton>
        ))}
      </FocusGroup>
      {failed ? (
        <p className="text-2xl text-zinc-400">No se pudo cargar el calendario.</p>
      ) : entries === null ? (
        <p className="text-2xl text-zinc-500">Cargando…</p>
      ) : (
        <CardGrid
          cards={dayEntries.map((e) => ({
            item: e.anime,
            key: `${e.anime.id}-${e.episode}`,
            badge: `${formatTime(e.airingAt)} · EP ${e.episode}`,
          }))}
          onSelect={openAnime}
          emptyMessage="No hay episodios este día."
        />
      )}
    </PageFrame>
  );
}
