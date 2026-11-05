import { useEffect, useState } from "react";
import type { AnimeTheme } from "@/lib/animethemes";

export type { AnimeTheme };

const MAX_IDS = 200;
// Themes per AniList ID, kept for the session
const cache = new Map<number, AnimeTheme[]>();

/** Openings and endings for these anime, by AniList ID (missing ones are asked from the server) */
export async function loadThemes(ids: number[]): Promise<Map<number, AnimeTheme[]>> {
  const missing = Array.from(new Set(ids)).filter((id) => !cache.has(id));
  for (let i = 0; i < missing.length; i += MAX_IDS) {
    const chunk = missing.slice(i, i + MAX_IDS);
    const res = await fetch(`/api/catalog/themes?ids=${chunk.join(",")}`);
    const data = await res.json();
    if (!data.success) throw new Error(data.error);
    for (const id of chunk) cache.set(id, (data.themes[id] as AnimeTheme[] | undefined) ?? []);
  }
  return new Map(ids.map((id) => [id, cache.get(id) ?? []]));
}

/** One anime's openings and endings; null while they load, [] when there are none */
export function useAnimeThemes(anilistId: number) {
  const [themes, setThemes] = useState<AnimeTheme[] | null>(() => cache.get(anilistId) ?? null);
  useEffect(() => {
    let cancelled = false;
    setThemes(cache.get(anilistId) ?? null);
    loadThemes([anilistId])
      .then((found) => !cancelled && setThemes(found.get(anilistId) ?? []))
      .catch(() => !cancelled && setThemes([]));
    return () => {
      cancelled = true;
    };
  }, [anilistId]);
  return themes;
}

/** "OP1", "ED", "OP2 · Spoiler" */
export const themeLabel = (t: AnimeTheme) => t.slug.replace(/v\d+$/, "");

export const themeArtists = (t: AnimeTheme) => t.artists.join(", ");
