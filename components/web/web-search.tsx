"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Clock, Search, SlidersHorizontal, X } from "lucide-react";
import type { CatalogRow, Genre } from "@/lib/anilist/types";
import { countFilters, EMPTY_FILTERS, hasAnyFilter, type CatalogFilters } from "@/lib/anilist/filters";
import { addRecentSearch, clearRecentSearches, useRecentSearches } from "@/lib/library/recent-searches";
import { useFilterRow, useTags, useUrlFilters } from "@/lib/library/use-filters";
import { usePagedRow } from "@/components/tv/catalog-row";
import { CardGrid, useMounted } from "@/components/tv/page-frame";
import { ActiveFilters, FilterPanel } from "./filter-panel";
import { JapaneseLabel } from "@/components/brand";

// What the library shows before anything is chosen
const BROWSE_ALL: CatalogFilters = { ...EMPTY_FILTERS, sort: "POPULARITY_DESC" };

// Same palette family as the TV genre tiles, flat so text keeps its contrast
const GENRE_COLORS = ["bg-rose-900", "bg-amber-900", "bg-emerald-900", "bg-sky-900", "bg-violet-900", "bg-fuchsia-900", "bg-teal-900", "bg-orange-900"];

function Results({ row, query }: { row: CatalogRow; query: string }) {
  const router = useRouter();
  const { items, hasNextPage, loadMore } = usePagedRow(row);
  return (
    <CardGrid
      cards={items.map((item) => ({ item }))}
      onSelect={(item) => {
        if (query) addRecentSearch(query);
        router.push(`/anime/${item.id}`);
      }}
      onNearEnd={hasNextPage ? loadMore : undefined}
      emptyMessage="Nada coincide con esta búsqueda. Prueba a quitar algún filtro o a escribir el título en romaji o en inglés."
    />
  );
}

function StartPoints({ genres, onGenre, onRecent }: { genres: Genre[]; onGenre: (name: string) => void; onRecent: (q: string) => void }) {
  const mounted = useMounted();
  const recent = useRecentSearches();
  return (
    <div className="flex flex-col gap-9">
      {mounted && recent.length > 0 && (
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-base md:text-lg">
              Búsquedas recientes
              <JapaneseLabel title="Búsquedas recientes" />
            </h2>
            <button type="button" onClick={clearRecentSearches} className="h-9 px-2 text-sm font-bold text-red-500 hover:text-red-400">
              Borrar
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            {recent.map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => onRecent(r)}
                className="flex items-center gap-2 h-10 px-3.5 rounded-full bg-ink-3 border-[1.5px] border-line text-sm font-medium text-zinc-200 hover:bg-zinc-800"
              >
                <Clock className="w-3.5 h-3.5 text-zinc-400" aria-hidden />
                {r}
              </button>
            ))}
          </div>
        </section>
      )}
      {/* Wide screens have the genres in the filter sidebar right next to this */}
      {genres.length > 0 && (
        <section className="md:hidden">
          <h2 className="mb-3 text-base md:text-lg">
            Explorar por género
            <JapaneseLabel title="Explorar por género" />
          </h2>
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-[repeat(auto-fill,minmax(11rem,1fr))]">
            {genres.map((genre, index) => (
              <button
                key={genre.name}
                type="button"
                onClick={() => onGenre(genre.name)}
                className={`flex items-end h-[4.5rem] md:h-24 p-3.5 rounded-xl border-[1.5px] border-line text-left text-base font-black text-white hover:brightness-125 ${GENRE_COLORS[index % GENRE_COLORS.length]}`}
              >
                {genre.label}
              </button>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

/**
 * Advanced search for computers and phones: text plus every filter, all kept in the URL.
 * Filters sit in a sidebar on wide screens and in a full-screen sheet on phones.
 */
export function WebSearch({ genres }: { genres: Genre[] }) {
  const [filters, setFilters] = useUrlFilters();
  const tags = useTags();
  // With nothing chosen the page is the library itself: the whole catalog, most popular first
  const browsing = !hasAnyFilter(filters);
  const { row, failed } = useFilterRow(browsing ? BROWSE_ALL : filters);
  const [text, setText] = useState(filters.q);
  const [sheetOpen, setSheetOpen] = useState(false);
  const count = countFilters(filters);

  // The top bar (wide screens) edits the URL; follow it. The URL holds the trimmed text,
  // so a trailing space being typed is kept
  useEffect(() => setText((current) => (current.trim() === filters.q ? current : filters.q)), [filters.q]);

  // The sheet covers the page: no scrolling behind it
  useEffect(() => {
    if (!sheetOpen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [sheetOpen]);

  const typeText = (value: string) => {
    setText(value);
    setFilters({ ...filters, q: value });
  };
  const update = (next: CatalogFilters) => setFilters(next);

  return (
    <div className="max-w-[1360px] mx-auto px-4 pt-6 pb-12 md:px-8 md:pt-10">
      <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight">
        {filters.q ? (
          <>
            <span className="md:hidden">
              Buscar
              <JapaneseLabel title="Buscar" />
            </span>
            <span className="hidden md:inline">Resultados para «{filters.q}»</span>
          </>
        ) : (
          <>
            <span className="md:hidden">
              Buscar
              <JapaneseLabel title="Buscar" />
            </span>
            <span className="hidden md:inline">Biblioteca</span>
          </>
        )}
      </h1>

      {/* Phones: text box and the button that opens the filters. Wide screens type in the top bar. */}
      <div className="md:hidden flex items-center gap-2 mt-5">
        <form
          role="search"
          onSubmit={(e) => {
            e.preventDefault();
            addRecentSearch(text);
            (document.activeElement as HTMLElement | null)?.blur();
          }}
          className="flex flex-1 min-w-0 items-center gap-2.5 h-12 px-3.5 rounded-xl bg-ink-3 border-[1.5px] border-line text-zinc-400 focus-within:border-zinc-500"
        >
          <Search className="w-5 h-5 flex-shrink-0" aria-hidden />
          <label htmlFor="page-search" className="sr-only">
            Buscar anime
          </label>
          <input
            id="page-search"
            type="search"
            enterKeyHint="search"
            autoComplete="off"
            value={text}
            onChange={(e) => typeText(e.target.value)}
            placeholder="Título del anime"
            className="flex-1 min-w-0 bg-transparent text-base font-medium text-white placeholder:text-zinc-500 outline-none [&::-webkit-search-cancel-button]:hidden"
          />
          {text && (
            <button type="button" aria-label="Borrar texto" onClick={() => typeText("")} className="-mr-1.5 p-1.5 text-zinc-400">
              <X className="w-5 h-5" />
            </button>
          )}
        </form>
        <button
          type="button"
          onClick={() => setSheetOpen(true)}
          aria-haspopup="dialog"
          className="relative flex flex-shrink-0 items-center justify-center gap-2 h-12 px-3 rounded-xl bg-ink-3 border-[1.5px] border-line text-sm font-bold"
        >
          <SlidersHorizontal className="w-5 h-5" aria-hidden />
          Filtros
          {count > 0 && (
            <span className="flex items-center justify-center min-w-[1.25rem] h-5 px-1 rounded-full bg-red-500 text-black text-xs font-bold">
              {count}
            </span>
          )}
        </button>
      </div>

      <div className="flex items-start gap-10 mt-6 md:mt-8">
        <aside
          aria-label="Filtros"
          // As tall as the window under the top bar, and it stays while the results scroll
          className="hidden md:block sticky top-16 w-72 flex-shrink-0 h-[calc(100vh-4rem)] overflow-y-auto overscroll-contain -mt-6 pt-6 pb-10 pr-3 pk-menu-scroll"
        >
          <FilterPanel filters={filters} onChange={update} genres={genres} tags={tags} />
        </aside>

        <section aria-label="Resultados" className="flex-1 min-w-0 flex flex-col gap-5">
          <ActiveFilters filters={filters} onChange={update} />
          {browsing && (
            <StartPoints
              genres={genres}
              onGenre={(name) => update({ ...EMPTY_FILTERS, genres: [name] })}
              onRecent={(q) => typeText(q)}
            />
          )}
          {browsing && (
            <div className="mt-2">
              <h2 className="text-base md:text-lg font-bold">Todo el catálogo</h2>
              <p className="text-sm text-zinc-400">
                Los más populares primero. <span className="md:hidden">Acota con «Filtros».</span>
                <span className="hidden md:inline">Acota con los filtros de la izquierda o escribe un título arriba.</span>
              </p>
            </div>
          )}
          {failed ? (
            <p className="text-zinc-400">No se pudo completar la búsqueda.</p>
          ) : row ? (
            <Results key={row.id} row={row} query={filters.q} />
          ) : (
            <p className="text-zinc-500">Buscando…</p>
          )}
        </section>
      </div>

      {sheetOpen && (
        <div role="dialog" aria-modal="true" aria-label="Filtros" className="md:hidden fixed top-0 left-0 z-50 flex flex-col w-full h-full bg-black">
          <div className="flex items-center justify-between h-16 px-4 border-b border-line">
            <h2 className="text-lg font-bold">Filtros</h2>
            <div className="flex items-center gap-1">
              {hasAnyFilter({ ...filters, q: "" }) && (
                <button
                  type="button"
                  onClick={() => update({ ...EMPTY_FILTERS, q: filters.q })}
                  className="h-10 px-3 text-sm font-semibold text-zinc-300"
                >
                  Limpiar
                </button>
              )}
              <button
                type="button"
                aria-label="Cerrar filtros"
                onClick={() => setSheetOpen(false)}
                className="flex items-center justify-center w-11 h-11 rounded-full hover:bg-zinc-900"
              >
                <X className="w-6 h-6" />
              </button>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto overscroll-contain px-4 pb-6 pk-menu-scroll">
            <FilterPanel filters={filters} onChange={update} genres={genres} tags={tags} />
          </div>
          <div className="p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] border-t border-line">
            <button
              type="button"
              onClick={() => setSheetOpen(false)}
              className="w-full h-12 rounded-xl bg-red-500 text-black font-bold hover:bg-red-400"
            >
              Ver resultados
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
