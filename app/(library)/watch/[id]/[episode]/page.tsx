import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getAnime } from "@/lib/anilist/catalog";
import { WatchScreen } from "@/components/tv/watch-screen";

export const dynamic = "force-dynamic";

interface PageProps {
  params: { id: string; episode: string };
  searchParams: { audio?: string };
}

async function load(params: PageProps["params"]) {
  const id = Number(params.id);
  const episode = Number(params.episode);
  if (!Number.isInteger(id) || id < 1 || !Number.isInteger(episode) || episode < 1) notFound();
  // Not capped by the episode count: the cached details can lag behind a new release
  const anime = await getAnime(id);
  if (!anime) notFound();
  return { anime, episode };
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  try {
    const { anime, episode } = await load(params);
    return { title: `${anime.title} · EP ${episode}` };
  } catch {
    return {};
  }
}

export default async function WatchPage({ params, searchParams }: PageProps) {
  const { anime, episode } = await load(params);
  const audio = searchParams.audio === "dub" ? "dub" : searchParams.audio === "sub" ? "sub" : undefined;
  // Keyed by episode so moving to the next one starts a fresh player
  return <WatchScreen key={episode} anime={anime} episode={episode} audio={audio} />;
}
