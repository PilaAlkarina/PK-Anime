"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { CatalogRow, Tag } from "@/lib/anilist/types";
import { filtersKey, filtersToParams, hasAnyFilter, parseFilters, type CatalogFilters } from "@/lib/anilist/filters";

const SEARCH_DELAY_MS = 350;

/**
 * Advanced search state kept in the URL, so a search can be shared, reloaded, and is still
 * there after opening an anime and coming back. Updates replace the history entry.
 */
export function useUrlFilters(): [CatalogFilters, (next: CatalogFilters) => void] {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const query = params.toString();
  const filters = useMemo(() => parseFilters(new URLSearchParams(query)), [query]);

  const setFilters = useCallback(
    (next: CatalogFilters) => {
      const qs = filtersToParams(next).toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [router, pathname]
  );

  return [filters, setFilters];
}

/** First page of results for the filters, fetched after a short pause; null while loading */
export function useFilterRow(filters: CatalogFilters) {
  const key = filtersKey(filters);
  const active = hasAnyFilter(filters);
  const [row, setRow] = useState<CatalogRow | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setRow(null);
    if (!active) return;
    const ctrl = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const params = new URLSearchParams({ kind: "filter", value: key });
        const data = await (await fetch(`/api/catalog/row?${params}`, { signal: ctrl.signal })).json();
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
  }, [key, active]);

  return { row, failed, active };
}

let tagsPromise: Promise<Tag[]> | null = null;

/** AniList's community tags, fetched once per page load */
export function useTags() {
  const [tags, setTags] = useState<Tag[]>([]);
  useEffect(() => {
    tagsPromise ??= fetch("/api/catalog/tags")
      .then((res) => res.json())
      .then((data) => (data.success ? (data.tags as Tag[]) : []))
      .catch(() => {
        tagsPromise = null;
        return [];
      });
    let cancelled = false;
    tagsPromise.then((list) => !cancelled && setTags(list));
    return () => {
      cancelled = true;
    };
  }, []);
  return tags;
}
