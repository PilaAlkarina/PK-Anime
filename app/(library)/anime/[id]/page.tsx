import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getAnime } from "@/lib/anilist/catalog";
import { AnimeScreen } from "@/components/tv/anime-screen";

export const dynamic = "force-dynamic";

interface PageProps {
  params: { id: string };
}

async function loadAnime(idParam: string) {
  const id = Number(idParam);
  if (!Number.isInteger(id) || id < 1) notFound();
  const anime = await getAnime(id);
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
  return <AnimeScreen anime={await loadAnime(params.id)} />;
}
