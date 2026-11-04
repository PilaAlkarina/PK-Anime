import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getAnimeWithEpisodes } from "@/lib/anilist/catalog";
import { AnimeScreen } from "@/components/tv/anime-screen";
import { WebAnimeScreen } from "@/components/web/web-anime";
import { getUiMode } from "@/lib/ui-mode-server";

export const dynamic = "force-dynamic";

interface PageProps {
  params: { id: string };
}

async function loadAnime(idParam: string) {
  const id = Number(idParam);
  if (!Number.isInteger(id) || id < 1) notFound();
  const anime = await getAnimeWithEpisodes(id);
  if (!anime) notFound();
  return anime;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  try {
    return { title: (await loadAnime(params.id)).title };
  } catch {
    return {};
  }
}

export default async function AnimePage({ params }: PageProps) {
  const anime = await loadAnime(params.id);
  return getUiMode() === "tv" ? <AnimeScreen anime={anime} /> : <WebAnimeScreen anime={anime} />;
}
