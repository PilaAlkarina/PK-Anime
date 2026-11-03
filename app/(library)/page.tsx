import { getHomeRows } from "@/lib/anilist/catalog";
import type { CatalogRow } from "@/lib/anilist/types";
import { HomeScreen } from "@/components/tv/home-screen";

// Rendered per request from the cached catalog, so builds never depend on AniList
export const dynamic = "force-dynamic";

export default async function LibraryHomePage() {
  let rows: CatalogRow[] = [];
  try {
    rows = await getHomeRows();
  } catch (err) {
    console.warn("[library] Home rows unavailable:", err instanceof Error ? err.message : err);
  }
  return <HomeScreen rows={rows} />;
}
