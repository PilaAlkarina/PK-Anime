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
            <h2 className="text-base md:text-lg font-bold">Búsquedas recientes</h2>
            <button type="button" onClick={clearRecentSearches} className="h-9 px-2 text-sm text-zinc-300 hover:text-white">
              Borrar
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            {recent.map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => onRecent(r)}
                className="flex items-center gap-2 h-10 px-3.5 rounded-full bg-zinc-900 border border-zinc-800 text-sm text-zinc-200 hover:bg-zinc-800"
              >
                <Clock className="w-3.5 h-3.5 text-zinc-400" aria-hidden />
                {r}
              </button>
            ))}
          </div>
        </section>
      )}
      {genres.length > 0 && (
        <section>
          <h2 className="mb-3 text-base md:text-lg font-bold">Explorar por género</h2>
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-[repeat(auto-fill,minmax(11rem,1fr))]">
            {genres.map((genre, index) => (
              <button
                key={genre.name}
                type="button"
                onClick={() => onGenre(genre.name)}
                className={`flex items-end h-[4.5rem] md:h-24 p-3.5 rounded-xl text-left font-bold hover:brightness-125 ${GENRE_COLORS[index % GENRE_COLORS.length]}`}
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
  const { row, failed, active } = useFilterRow(filters);
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
            <span className="md:hidden">Buscar</span>
            <span className="hidden md:inline">Resultados para «{filters.q}»</span>
          </>
        ) : (
          "Buscar"
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
          className="flex flex-1 min-w-0 items-center gap-2.5 h-12 px-3.5 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-400 focus-within:border-zinc-500"
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
            className="flex-1 min-w-0 bg-transparent text-base text-white placeholder:text-zinc-500 outline-none [&::-webkit-search-cancel-button]:hidden"
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
          className="relative flex flex-shrink-0 items-center justify-center gap-2 h-12 px-3 rounded-xl bg-zinc-900 border border-zinc-800 text-sm font-semibold"
        >
          <SlidersHorizontal className="w-5 h-5" aria-hidden />
          Filtros
          {count > 0 && (
            <span className="flex items-center justify-center min-w-[1.25rem] h-5 px-1 rounded-full bg-white text-black text-xs font-bold">
              {count}
            </span>
          )}
        </button>
      </div>

      <div className="flex items-start gap-10 mt-6 md:mt-8">
        <aside
          aria-label="Filtros"
          className="hidden md:block sticky top-24 w-72 flex-shrink-0 max-h-[calc(100vh-7rem)] overflow-y-auto pr-3 tv-no-scrollbar"
        >
          <FilterPanel filters={filters} onChange={update} genres={genres} tags={tags} />
        </aside>

        <section aria-label="Resultados" className="flex-1 min-w-0 flex flex-col gap-5">
          <ActiveFilters filters={filters} onChange={update} />
          {!active ? (
            <StartPoints
              genres={genres}
              onGenre={(name) => update({ ...EMPTY_FILTERS, genres: [name] })}
              onRecent={(q) => typeText(q)}
            />
          ) : failed ? (
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
          <div className="flex items-center justify-between h-16 px-4 border-b border-zinc-900">
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
          <div className="flex-1 overflow-y-auto px-4 pb-6">
            <FilterPanel filters={filters} onChange={update} genres={genres} tags={tags} />
          </div>
          <div className="p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] border-t border-zinc-900">
            <button
              type="button"
              onClick={() => setSheetOpen(false)}
              className="w-full h-12 rounded-xl bg-white text-black font-bold"
            >
              Ver resultados
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
