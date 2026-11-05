"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { BarChart3, Radio } from "lucide-react";
import { useRouter } from "next/navigation";
import { useIsTv } from "@/components/ui-mode";
import type { CatalogItem, CatalogRow, Genre, ScheduleEntry } from "@/lib/anilist/types";
import { formatTime, startOfDay } from "@/lib/library/format";
import { useAccount } from "@/lib/library/account";
import { useMyList } from "@/lib/library/my-list";
import {
  listFormats,
  matchesFormat,
  matchesScore,
  matchesStatus,
  SCORE_FILTERS,
  sortList,
  STATUS_FILTERS,
  updateListView,
  useListView,
  type ListView,
} from "@/lib/library/list-view";
import { mergeMyList, REMOTE_STATUS_LABELS, useRemoteLibrary } from "@/lib/library/remote";
import { usePagedRow } from "./catalog-row";
import { FocusButton, FocusGroup, useTvFocusable } from "./focusable";
import { ListTransfer } from "./list-transfer";
import { STATUS_STYLES } from "./list-styles";
import { MyListControls } from "./my-list-controls";
import { CardGrid, PageFrame, useMounted, useRevealOnFocus } from "./page-frame";
import { cn } from "@/lib/utils";

export function useOpenAnime() {
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
        focused && "koma"
      )}
    >
      <span className="text-3xl font-bold">{genre.label}</span>
    </div>
  );
}

export function GenresScreen({ genres }: { genres: Genre[] }) {
  const isTv = useIsTv();
  return (
    <PageFrame title="Géneros">
      {genres.length === 0 ? (
        <p className="text-lg text-zinc-400 tv:text-2xl">No se pudieron cargar los géneros.</p>
      ) : !isTv ? (
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-[repeat(auto-fill,minmax(13rem,1fr))] sm:gap-4">
          {genres.map((genre, index) => (
            <Link
              key={genre.name}
              href={`/search?genre=${encodeURIComponent(genre.name)}`}
              className={cn(
                "flex items-end h-20 sm:h-28 p-4 rounded-xl sm:rounded-2xl bg-gradient-to-br text-lg sm:text-xl font-bold hover:brightness-125",
                GENRE_COLORS[index % GENRE_COLORS.length]
              )}
            >
              {genre.label}
            </Link>
          ))}
        </div>
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

// Long remote lists are drawn a page at a time, so TVs don't build a thousand cards at once
const LIST_PAGE = 60;

export function MyListScreen() {
  const router = useRouter();
  const isTv = useIsTv();
  const openAnime = useOpenAnime();
  const mounted = useMounted();
  const list = useMyList();
  const account = useAccount();
  const remote = useRemoteLibrary();
  const view = useListView();
  const [shown, setShown] = useState(LIST_PAGE);
  const items = useMemo(() => mergeMyList(list, remote), [list, remote]);

  // This device's list has statuses too; "only on this device" means something only next to a service
  const statuses = STATUS_FILTERS.filter((value) => remote || value !== "local")
    .map((value) => ({ value, count: items.filter((i) => matchesStatus(i, value)).length }))
    .filter(({ value, count }) => value === "all" || count > 0);
  // A remembered filter can empty out (e.g. after exporting the local items); fall back to all
  const status = statuses.some((s) => s.value === view.status) ? view.status : "all";
  const inStatus = items.filter((i) => matchesStatus(i, status));
  const formats = listFormats(inStatus);
  const format = formats.some((f) => f.value === view.format) ? view.format : "any";
  const scores = SCORE_FILTERS.filter(
    (f) => f.value === "any" || inStatus.some((i) => matchesScore(i, f.value) && matchesFormat(i, format))
  );
  const score = scores.some((f) => f.value === view.score) ? view.score : "any";
  const visible = sortList(
    inStatus.filter((i) => matchesScore(i, score) && matchesFormat(i, format)),
    view.sort
  );

  const change = (changes: Partial<ListView>) => {
    updateListView(changes);
    setShown(LIST_PAGE);
  };

  const statsButton = items.length > 0 && (
    <FocusGroup className="flex mb-8">
      <FocusButton variant="secondary" className="mr-4" onSelect={() => router.push("/stats")}>
        <BarChart3 className="w-6 h-6 mr-3" /> Estadísticas
      </FocusButton>
      <FocusButton variant="secondary" onSelect={() => router.push("/radio")}>
        <Radio className="w-6 h-6 mr-3" /> Radio de openings
      </FocusButton>
    </FocusGroup>
  );
  const controls = items.length > 0 && (
    <MyListControls
      statuses={statuses}
      formats={formats}
      scores={scores}
      view={{ ...view, status, format, score }}
      onChange={change}
    />
  );

  const subtitle = remote
    ? `Unida con tu lista de ${remote.provider.name}. «LOCAL» marca lo que solo está en este dispositivo.`
    : account && !account.signedIn && account.providers.length > 0
      ? `Guardada en este dispositivo. Inicia sesión en Cuenta para unirla con tu lista de ${account.providers.map((p) => p.name).join(" o ")}.`
      : undefined;

  return (
    <PageFrame title="Mi lista" subtitle={subtitle} ready={mounted}>
      {isTv ? (
        <>
          {statsButton}
          {remote && (
            <div className="mb-10">
              <ListTransfer />
            </div>
          )}
          {controls}
        </>
      ) : (
        // Computers: the filters on the left, the stats and the transfer in a card on the right
        <div className="md:flex md:items-start md:gap-8">
          <div className="flex-1 min-w-0">{controls}</div>
          {(items.length > 0 || remote) && (
            <aside className="mb-6 md:w-[21rem] md:flex-shrink-0 p-4 rounded-2xl bg-zinc-950 border-[1.5px] border-line">
              {items.length > 0 && (
                <div className="grid grid-cols-2 gap-2">
                  <FocusButton variant="secondary" className="w-full !px-3" onSelect={() => router.push("/stats")}>
                    <BarChart3 className="w-5 h-5 mr-2" /> Estadísticas
                  </FocusButton>
                  <FocusButton variant="secondary" className="w-full !px-3" onSelect={() => router.push("/radio")}>
                    <Radio className="w-5 h-5 mr-2" /> Radio
                  </FocusButton>
                </div>
              )}
              {remote && (
                <div className={items.length > 0 ? "mt-4 pt-4 border-t border-line" : undefined}>
                  <ListTransfer />
                </div>
              )}
            </aside>
          )}
        </div>
      )}
      <CardGrid
        cards={visible.slice(0, shown).map(({ item, origin, entry }) => {
          const badgeStatus = origin === "local" && remote ? "local" : entry?.status;
          return {
            item,
            score: entry?.score,
            // Inside a status filter every card has that status, so the badge would only repeat it
            ...(badgeStatus && (status === "all" || badgeStatus === "local")
              ? {
                  badge: badgeStatus === "local" ? "LOCAL" : REMOTE_STATUS_LABELS[badgeStatus],
                  badgeClassName: STATUS_STYLES[badgeStatus].badge,
                }
              : {}),
          };
        })}
        onSelect={openAnime}
        onNearEnd={shown < visible.length ? () => setShown((n) => n + LIST_PAGE) : undefined}
        emptyMessage={
          items.length > 0
            ? "Nada coincide con estos filtros."
            : "Todavía no has guardado nada. Añade series desde su ficha con «Mi lista»."
        }
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
      <FocusGroup className="flex flex-wrap mb-6 tv:mb-10">
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
        <p className="text-lg text-zinc-400 tv:text-2xl">No se pudo cargar el calendario.</p>
      ) : entries === null ? (
        <p className="text-lg text-zinc-500 tv:text-2xl">Cargando…</p>
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
