"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Clock, Search, X } from "lucide-react";
import type { CatalogRow, Genre } from "@/lib/anilist/types";
import { addRecentSearch, clearRecentSearches, useRecentSearches } from "@/lib/library/recent-searches";
import { usePagedRow } from "@/components/tv/catalog-row";
import { CardGrid, useMounted } from "@/components/tv/page-frame";

const SEARCH_DELAY_MS = 350;

// Same palette family as the TV genre tiles, flat so text keeps its contrast
const GENRE_COLORS = ["bg-rose-900", "bg-amber-900", "bg-emerald-900", "bg-sky-900", "bg-violet-900", "bg-fuchsia-900", "bg-teal-900", "bg-orange-900"];

function Results({ row, query }: { row: CatalogRow; query: string }) {
  const router = useRouter();
  const { items, hasNextPage, loadMore } = usePagedRow(row);
  return (
    <CardGrid
      cards={items.map((item) => ({ item }))}
      onSelect={(item) => {
        addRecentSearch(query);
        router.push(`/anime/${item.id}`);
      }}
      onNearEnd={hasNextPage ? loadMore : undefined}
      emptyMessage="Sin resultados. Prueba con el título en romaji o en inglés."
    />
  );
}

/** Search for computers and phones: the device's own keyboard, recent searches and genres */
export function WebSearch({ genres }: { genres: Genre[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const mounted = useMounted();
  const recent = useRecentSearches();
  const urlQuery = params.get("q") ?? "";
  const [query, setQuery] = useState(urlQuery);
  const [row, setRow] = useState<CatalogRow | null>(null);
  const [failed, setFailed] = useState(false);
  const q = query.trim();

  // The top bar (wide screens) edits the URL; follow it. The URL holds the trimmed query,
  // so a trailing space being typed is kept
  useEffect(() => setQuery((current) => (current.trim() === urlQuery ? current : urlQuery)), [urlQuery]);

  useEffect(() => {
    if (!q) {
      setRow(null);
      return;
    }
    const ctrl = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const search = new URLSearchParams({ kind: "search", value: q });
        const data = await (await fetch(`/api/catalog/row?${search}`, { signal: ctrl.signal })).json();
        if (!data.success) throw new Error(data.error);
        setRow(data.row);
        setFailed(false);
      } catch (err) {
        if ((err as Error)?.name !== "AbortError") setFailed(true);
      }
    }, SEARCH_DELAY_MS);
    return () => {
      clearTimeout(timer);
      ctrl.abort();
    };
  }, [q]);

  const update = (value: string) => {
    setQuery(value);
    const next = value.trim();
    router.replace(next ? `${pathname}?q=${encodeURIComponent(next)}` : pathname, { scroll: false });
  };

  return (
    <div className="max-w-[1360px] mx-auto px-4 pt-6 pb-12 md:px-8 md:pt-10">
      <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight">
        {q ? (
          <>
            <span className="md:hidden">Buscar</span>
            <span className="hidden md:inline">Resultados para «{q}»</span>
          </>
        ) : (
          "Buscar"
        )}
      </h1>

      {/* Wide screens search from the top bar */}
      <form
        role="search"
        onSubmit={(e) => {
          e.preventDefault();
          addRecentSearch(query);
          (document.activeElement as HTMLElement | null)?.blur();
        }}
        className="md:hidden flex items-center gap-2.5 h-12 mt-5 px-3.5 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-400 focus-within:border-zinc-500"
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
          value={query}
          onChange={(e) => update(e.target.value)}
          placeholder="Títulos en español, inglés o romaji"
          className="flex-1 min-w-0 bg-transparent text-base text-white placeholder:text-zinc-500 outline-none [&::-webkit-search-cancel-button]:hidden"
        />
        {query && (
          <button type="button" aria-label="Borrar búsqueda" onClick={() => update("")} className="-mr-1.5 p-1.5 text-zinc-400">
            <X className="w-5 h-5" />
          </button>
        )}
      </form>

      <div className="mt-7">
        {q ? (
          failed ? (
            <p className="text-zinc-400">No se pudo completar la búsqueda.</p>
          ) : row ? (
            <Results key={row.id + q} row={row} query={q} />
          ) : (
            <p className="text-zinc-500">Buscando…</p>
          )
        ) : (
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
                      onClick={() => update(r)}
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
                <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-[repeat(auto-fill,minmax(12rem,1fr))]">
                  {genres.map((genre, index) => (
                    <Link
                      key={genre.name}
                      href={`/genres/${encodeURIComponent(genre.name)}`}
                      className={`flex items-end h-[4.5rem] md:h-24 p-3.5 rounded-xl font-bold hover:brightness-125 ${GENRE_COLORS[index % GENRE_COLORS.length]}`}
                    >
                      {genre.label}
                    </Link>
                  ))}
                </div>
              </section>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
