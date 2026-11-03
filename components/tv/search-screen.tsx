"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Delete, Keyboard, SlidersHorizontal, Space, X } from "lucide-react";
import type { CatalogItem, CatalogRow, Genre } from "@/lib/anilist/types";
import { GENRE_LABELS } from "@/lib/anilist/genres";
import { countFilters, filterLabels, MAX_QUERY_LENGTH } from "@/lib/anilist/filters";
import { useFilterRow, useUrlFilters } from "@/lib/library/use-filters";
import { usePagedRow } from "./catalog-row";
import { FocusButton, FocusGroup, Screen } from "./focusable";
import { useBackHandler } from "./navigation-provider";
import { REMOTE_TEXT_EVENT, takePendingRemoteText } from "@/lib/tv/remote-text";
import { CardGrid, ScrollArea } from "./page-frame";
import { TvFilterPanel } from "./tv-filter-panel";

const KEYS = "abcdefghijklmnopqrstuvwxyz1234567890".split("");

function Results({ row, title, onSelect }: { row: CatalogRow; title: string; onSelect: (item: CatalogItem) => void }) {
  const { items, loadMore } = usePagedRow(row);
  return (
    <>
      <h2 className="mb-8 text-3xl font-bold">{title}</h2>
      <CardGrid
        cards={items.map((item) => ({ item }))}
        onSelect={onSelect}
        onNearEnd={loadMore}
        emptyMessage="Nada coincide. Prueba a quitar algún filtro o a escribir el título en romaji o en inglés."
      />
    </>
  );
}

/** Popular titles shown before anything is typed or filtered */
function useTrendingRow(enabled: boolean) {
  const [row, setRow] = useState<CatalogRow | null>(null);
  useEffect(() => {
    if (!enabled || row) return;
    const ctrl = new AbortController();
    fetch("/api/catalog/row?kind=trending", { signal: ctrl.signal })
      .then((res) => res.json())
      .then((data) => data.success && setRow(data.row))
      .catch(() => {});
    return () => ctrl.abort();
  }, [enabled, row]);
  return row;
}

export function SearchScreen({ genres }: { genres: Genre[] }) {
  const router = useRouter();
  const [filters, setFilters] = useUrlFilters();
  // Typed text lives here so a trailing space survives; the URL keeps the trimmed version
  const [query, setQuery] = useState(filters.q);
  const [panel, setPanel] = useState<"keyboard" | "filters">("keyboard");
  const { row: filterRow, failed, active } = useFilterRow(filters);
  const trending = useTrendingRow(!active);
  const count = countFilters(filters);

  const type = (text: string) => setQuery((q) => (q + text).slice(0, MAX_QUERY_LENGTH));
  const erase = () => setQuery((q) => q.slice(0, -1));

  useEffect(() => {
    if (query.trim() !== filters.q) setFilters({ ...filters, q: query });
    // Only typing moves the text into the URL
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  // Text typed on the phone remote replaces the query, including text sent before search opened
  useEffect(() => {
    const pending = takePendingRemoteText();
    if (pending !== null) setQuery(pending.slice(0, MAX_QUERY_LENGTH));
    const onRemoteText = (e: Event) => setQuery(String((e as CustomEvent).detail ?? "").slice(0, MAX_QUERY_LENGTH));
    window.addEventListener(REMOTE_TEXT_EVENT, onRemoteText);
    return () => window.removeEventListener(REMOTE_TEXT_EVENT, onRemoteText);
  }, []);

  // A physical keyboard types straight into the query
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || e.key.length !== 1) return;
      if (!/^[\p{L}\p{N} '\-:!?.]$/u.test(e.key)) return;
      e.preventDefault();
      type(e.key);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  // Backspace deletes a letter; the remote's Back still leaves the page
  useBackHandler((e) => {
    if (e.key === "Backspace" && query) {
      erase();
      return true;
    }
  });

  const row = active ? filterRow : trending;
  const labels = filterLabels(filters, (g) => GENRE_LABELS[g] || g);
  const title = !active
    ? "Tendencias"
    : filters.q
      ? `Resultados para «${filters.q}»`
      : "Resultados";

  return (
    <Screen>
      <div className="fixed top-0 bottom-0 left-[7rem] w-[34rem] flex flex-col pl-12 pr-6 pt-[8vh]">
        <h1 className="text-5xl font-bold">Buscar</h1>
        <div className="flex items-center flex-shrink-0 h-16 mt-8 px-5 rounded-xl bg-white/10 text-2xl">
          {query ? <span className="truncate">{query}</span> : <span className="text-zinc-500">Título del anime</span>}
          <span className="w-0.5 h-8 ml-1 bg-white animate-pulse" />
        </div>

        <FocusGroup className="flex flex-shrink-0 mt-5">
          <FocusButton variant="chip" className="mr-3" active={panel === "keyboard"} onSelect={() => setPanel("keyboard")}>
            <Keyboard className="w-5 h-5 mr-2" /> Teclado
          </FocusButton>
          <FocusButton variant="chip" active={panel === "filters"} onSelect={() => setPanel("filters")}>
            <SlidersHorizontal className="w-5 h-5 mr-2" /> Filtros{count > 0 ? ` · ${count}` : ""}
          </FocusButton>
        </FocusGroup>

        {panel === "keyboard" ? (
          <>
            <FocusGroup className="grid grid-cols-3 gap-2 mt-5">
              <FocusButton variant="chip" className="w-full h-14 rounded-lg" onSelect={() => type(" ")}>
                <Space className="w-6 h-6 mr-2" /> Espacio
              </FocusButton>
              <FocusButton variant="chip" className="w-full h-14 rounded-lg" onSelect={erase}>
                <Delete className="w-6 h-6 mr-2" /> Borrar
              </FocusButton>
              <FocusButton variant="chip" className="w-full h-14 rounded-lg" onSelect={() => setQuery("")}>
                <X className="w-6 h-6 mr-2" /> Limpiar
              </FocusButton>
            </FocusGroup>
            <FocusGroup className="grid grid-cols-6 gap-2 mt-2">
              {KEYS.map((key) => (
                <FocusButton
                  key={key}
                  variant="chip"
                  className="w-full h-14 px-0 rounded-lg text-2xl uppercase"
                  onSelect={() => type(key)}
                >
                  {key}
                </FocusButton>
              ))}
            </FocusGroup>
          </>
        ) : (
          <ScrollArea className="flex-1 min-h-0 mt-5 pb-[12vh]">
            <TvFilterPanel filters={filters} onChange={setFilters} genres={genres} />
          </ScrollArea>
        )}
      </div>

      <ScrollArea className="fixed top-0 bottom-0 left-[41rem] right-0 pt-[8vh] pr-12 pb-[20vh]">
        {labels.length > 0 && <p className="mb-4 text-xl text-zinc-400 line-clamp-2">{labels.join(" · ")}</p>}
        {active && failed ? (
          <p className="text-2xl text-zinc-400">No se pudo completar la búsqueda.</p>
        ) : row ? (
          <Results key={row.id} row={row} title={title} onSelect={(item) => router.push(`/anime/${item.id}`)} />
        ) : (
          <p className="text-2xl text-zinc-500">Cargando…</p>
        )}
      </ScrollArea>
    </Screen>
  );
}
