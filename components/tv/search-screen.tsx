"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Delete, Space, X } from "lucide-react";
import type { CatalogItem, CatalogRow } from "@/lib/anilist/types";
import { usePagedRow } from "./catalog-row";
import { FocusButton, FocusGroup, Screen } from "./focusable";
import { useBackHandler } from "./navigation-provider";
import { CardGrid, ScrollArea } from "./page-frame";

const KEYS = "abcdefghijklmnopqrstuvwxyz1234567890".split("");
const MAX_QUERY = 60;
const SEARCH_DELAY_MS = 450;

function Results({ row, onSelect }: { row: CatalogRow; onSelect: (item: CatalogItem) => void }) {
  const { items, loadMore } = usePagedRow(row);
  return (
    <>
      <h2 className="mb-8 text-3xl font-bold">{row.title}</h2>
      <CardGrid
        cards={items.map((item) => ({ item }))}
        onSelect={onSelect}
        onNearEnd={loadMore}
        emptyMessage="Sin resultados. Prueba con el título en romaji o en inglés."
      />
    </>
  );
}

export function SearchScreen() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [row, setRow] = useState<CatalogRow | null>(null);
  const [failed, setFailed] = useState(false);

  const type = (text: string) => setQuery((q) => (q + text).slice(0, MAX_QUERY));
  const erase = () => setQuery((q) => q.slice(0, -1));

  // Results follow the query after a pause; an empty query shows what's trending
  useEffect(() => {
    const q = query.trim();
    const params = new URLSearchParams(q ? { kind: "search", value: q } : { kind: "trending" });
    const ctrl = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const data = await (await fetch(`/api/catalog/row?${params}`, { signal: ctrl.signal })).json();
        if (!data.success) throw new Error(data.error);
        setRow(data.row);
        setFailed(false);
      } catch (err) {
        if ((err as Error)?.name !== "AbortError") setFailed(true);
      }
    }, q ? SEARCH_DELAY_MS : 0);
    return () => {
      clearTimeout(timer);
      ctrl.abort();
    };
  }, [query]);

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

  return (
    <Screen>
      <div className="fixed top-0 bottom-0 left-[7rem] w-[34rem] pl-12 pr-6 pt-[8vh]">
        <h1 className="text-5xl font-bold">Buscar</h1>
        <div className="flex items-center h-16 mt-8 px-5 rounded-xl bg-white/10 text-2xl">
          {query ? <span className="truncate">{query}</span> : <span className="text-zinc-500">Título del anime</span>}
          <span className="w-0.5 h-8 ml-1 bg-white animate-pulse" />
        </div>

        <FocusGroup className="grid grid-cols-3 gap-2 mt-6">
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
      </div>

      <ScrollArea className="fixed top-0 bottom-0 left-[41rem] right-0 pt-[8vh] pr-12 pb-[20vh]">
        {failed ? (
          <p className="text-2xl text-zinc-400">No se pudo completar la búsqueda.</p>
        ) : row ? (
          <Results key={row.id} row={row} onSelect={(item) => router.push(`/anime/${item.id}`)} />
        ) : (
          <p className="text-2xl text-zinc-500">Cargando…</p>
        )}
      </ScrollArea>
    </Screen>
  );
}
