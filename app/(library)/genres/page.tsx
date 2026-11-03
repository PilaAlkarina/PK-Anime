import { getGenres } from "@/lib/anilist/catalog";
import type { Genre } from "@/lib/anilist/types";
import { GenresScreen } from "@/components/tv/browse-screens";

export const dynamic = "force-dynamic";
export const metadata = { title: "Géneros" };

export default async function GenresPage() {
  let genres: Genre[] = [];
  try {
    genres = await getGenres();
  } catch (err) {
    console.warn("[library] Genres unavailable:", err instanceof Error ? err.message : err);
  }
  return <GenresScreen genres={genres} />;
}
