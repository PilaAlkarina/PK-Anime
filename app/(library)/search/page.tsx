import { Suspense } from "react";
import { getGenres } from "@/lib/anilist/catalog";
import type { Genre } from "@/lib/anilist/types";
import { SearchScreen } from "@/components/tv/search-screen";
import { WebSearch } from "@/components/web/web-search";
import { getUiMode } from "@/lib/ui-mode-server";

export const metadata = { title: "Buscar" };
export const dynamic = "force-dynamic";

export default async function SearchPage() {
  let genres: Genre[] = [];
  try {
    genres = await getGenres();
  } catch (err) {
    console.warn("[library] Genres unavailable:", err instanceof Error ? err.message : err);
  }
  // Both screens read their filters from the URL (useSearchParams), which needs a boundary
  return <Suspense>{getUiMode() === "tv" ? <SearchScreen genres={genres} /> : <WebSearch genres={genres} />}</Suspense>;
}
