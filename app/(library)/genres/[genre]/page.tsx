import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getGenres, getRow } from "@/lib/anilist/catalog";
import { RowGridScreen } from "@/components/tv/browse-screens";

export const dynamic = "force-dynamic";

interface PageProps {
  params: { genre: string };
}

async function findGenre(param: string) {
  let name = param;
  try {
    name = decodeURIComponent(param);
  } catch {}
  const genre = (await getGenres()).find((g) => g.name === name);
  if (!genre) notFound();
  return genre;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  try {
    return { title: (await findGenre(params.genre)).label };
  } catch {
    return {};
  }
}

export default async function GenrePage({ params }: PageProps) {
  const genre = await findGenre(params.genre);
  const row = await getRow("genre", genre.name, 1);
  return <RowGridScreen row={row} subtitle="Los más populares primero" />;
}
