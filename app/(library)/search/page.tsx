import { Suspense } from "react";
import { getGenres } from "@/lib/anilist/catalog";
import type { Genre } from "@/lib/anilist/types";
import { SearchScreen } from "@/components/tv/search-screen";
import { WebSearch } from "@/components/web/web-search";
import { getUiMode } from "@/lib/ui-mode-server";

export const metadata = { title: "Buscar" };

export default async function SearchPage() {
  if (getUiMode() === "tv") return <SearchScreen />;

  let genres: Genre[] = [];
  try {
    genres = await getGenres();
  } catch (err) {
    console.warn("[library] Genres unavailable:", err instanceof Error ? err.message : err);
  }
  return (
    <Suspense>
      <WebSearch genres={genres} />
    </Suspense>
  );
}
