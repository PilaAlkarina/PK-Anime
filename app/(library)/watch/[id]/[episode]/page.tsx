import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getAnimeWithEpisodes, getEpisodeAiring } from "@/lib/anilist/catalog";
import type { AnimeDetail } from "@/lib/anilist/types";
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
  // Not capped by the available count: the cached details can lag behind a new release. Past the
  // series' total, though, there's no such episode
  const anime = await getAnimeWithEpisodes(id);
  if (!anime || (anime.episodes && episode > anime.episodes)) notFound();
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

/**
 * When this episode aired or airs, for the player's notices ("aired 25 min ago", "airs on
 * Sunday"). The details already carry what's still to come; only a recent episode of a series
 * still airing is looked up, and a failure just leaves it unknown.
 */
async function episodeAiring(anime: AnimeDetail, episode: number): Promise<number | null> {
  const scheduled = anime.upcomingAirings?.find((a) => a.episode === episode)?.airingAt;
  if (scheduled) return scheduled;
  const airing = anime.status === "RELEASING" || anime.status === "NOT_YET_RELEASED";
  const recent = anime.availableEpisodes == null || episode >= anime.availableEpisodes - 1;
  if (!airing || !recent) return null;
  return getEpisodeAiring(anime.id, episode).catch(() => null);
}

export default async function WatchPage({ params, searchParams }: PageProps) {
  const { anime, episode } = await load(params);
  const airingAt = await episodeAiring(anime, episode);
  const audio = searchParams.audio === "dub" ? "dub" : searchParams.audio === "sub" ? "sub" : undefined;
  // Keyed by episode so moving to the next one starts a fresh player
  return <WatchScreen key={episode} anime={anime} episode={episode} audio={audio} airingAt={airingAt} />;
}
