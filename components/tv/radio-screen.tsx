"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Radio } from "lucide-react";
import type { CatalogItem } from "@/lib/anilist/types";
import { useMyList } from "@/lib/library/my-list";
import { mergeMyList, useRemoteLibrary } from "@/lib/library/remote";
import { loadThemes } from "@/lib/library/themes";
import { ThemePlayer, type ThemeTrack } from "@/components/theme-player";
import { FocusButton, FocusGroup } from "./focusable";
import { PageFrame, useMounted } from "./page-frame";
import { RadioLibrary, type LibraryGroup } from "./radio-library";

type Kind = "OP" | "ED" | "both";
type Order = "shuffle" | "score";

const KINDS: { value: Kind; label: string }[] = [
  { value: "OP", label: "Openings" },
  { value: "ED", label: "Endings" },
  { value: "both", label: "Ambos" },
];
const ORDERS: { value: Order; label: string }[] = [
  { value: "shuffle", label: "Aleatorio" },
  { value: "score", label: "Tu nota primero" },
];
/** Anime asked for per request; the first batch is enough to start */
const BATCH = 25;
const MAX_ANIME = 200;

/** Fisher–Yates with a fixed seed, so the order holds while more themes arrive */
function shuffled<T>(items: T[], seed: number) {
  const out = [...items];
  let s = seed;
  const random = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * Radio de openings: the openings and endings of the anime on the list (watching, completed or
 * paused), best scored first or shuffled, one after another in the theme player. Themes come
 * from AnimeThemes in batches, so it can start while the rest load.
 */
export function RadioScreen() {
  const mounted = useMounted();
  const list = useMyList();
  const remote = useRemoteLibrary();
  const [kind, setKind] = useState<Kind>("OP");
  const [order, setOrder] = useState<Order>("shuffle");
  const [seed] = useState(() => Math.floor(Math.random() * 100000));
  const [loaded, setLoaded] = useState<Map<number, ThemeTrack[]>>(new Map());
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  /** What the player is playing: the radio from the start, or the library from a song */
  const [playing, setPlaying] = useState<{ tracks: ThemeTrack[]; index: number } | null>(null);

  // The anime to draw from, best scored first
  const anime = useMemo(() => {
    const seen = new Set<number>();
    return mergeMyList(list, remote)
      .filter(({ entry }) => entry && (entry.status === "completed" || entry.status === "watching" || entry.status === "paused"))
      .sort((a, b) => (b.entry?.score ?? 0) - (a.entry?.score ?? 0))
      .map(({ item }) => item)
      .filter((item) => !seen.has(item.id) && !!seen.add(item.id))
      .slice(0, MAX_ANIME);
  }, [list, remote]);
  const animeKey = anime.map((a) => a.id).join(",");

  // Themes in batches of BATCH anime
  const startedRef = useRef("");
  useEffect(() => {
    if (!animeKey || startedRef.current === animeKey) return;
    startedRef.current = animeKey;
    let cancelled = false;
    const byId = new Map(anime.map((a) => [a.id, a] as [number, CatalogItem]));
    (async () => {
      setLoading(true);
      setFailed(false);
      for (let i = 0; i < anime.length && !cancelled; i += BATCH) {
        const ids = anime.slice(i, i + BATCH).map((a) => a.id);
        try {
          const found = await loadThemes(ids);
          if (cancelled) return;
          setLoaded((prev) => {
            const next = new Map(prev);
            for (const [id, themes] of found) {
              next.set(
                id,
                themes
                  .filter((t) => !t.nsfw)
                  .map((theme) => ({ theme, animeTitle: byId.get(id)?.title ?? "", animeId: id, cover: byId.get(id)?.cover ?? null }))
              );
            }
            return next;
          });
        } catch {
          setFailed(true);
          break;
        }
      }
      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
      startedRef.current = "";
    };
  }, [animeKey]);

  const tracks = useMemo(() => {
    const ordered: ThemeTrack[] = [];
    for (const a of anime) {
      for (const track of loaded.get(a.id) ?? []) {
        if (kind === "both" || track.theme.type === kind) ordered.push(track);
      }
    }
    return order === "shuffle" ? shuffled(ordered, seed) : ordered;
  }, [anime, loaded, kind, order, seed]);


  // The library: the same songs, by anime A–Z
  const groups = useMemo<LibraryGroup[]>(
    () =>
      anime
        .map((a) => ({
          animeId: a.id,
          animeTitle: a.title,
          cover: a.cover,
          tracks: (loaded.get(a.id) ?? []).filter((t) => kind === "both" || t.theme.type === kind),
        }))
        .filter((g) => g.tracks.length > 0)
        .sort((a, b) => a.animeTitle.localeCompare(b.animeTitle, "es", { sensitivity: "base" })),
    [anime, loaded, kind]
  );
  // Anime with songs of the chosen kind, the same count the library shows
  const withThemes = groups.length;
  const radioLabel = kind === "ED" ? "Radio de endings" : kind === "both" ? "Radio de openings y endings" : "Radio de openings";

  return (
    <PageFrame
      title="Radio de openings"
      subtitle="Los openings y endings de lo que estás viendo, has terminado o tienes en pausa en Mi lista, uno detrás de otro. Vídeos de AnimeThemes."
      ready={mounted}
    >
      {anime.length === 0 ? (
        <p className="text-lg text-zinc-400 tv:text-2xl">Añade a Mi lista algún anime que estés viendo o hayas terminado.</p>
      ) : (
        <>
          <FocusGroup className="flex flex-wrap items-center">
            {KINDS.map(({ value, label }) => (
              <FocusButton key={value} variant="chip" className="mr-2 mb-2 tv:mr-3 tv:mb-3" active={kind === value} onSelect={() => setKind(value)}>
                {label}
              </FocusButton>
            ))}
          </FocusGroup>
          <FocusGroup className="flex flex-wrap items-center mt-2">
            {ORDERS.map(({ value, label }) => (
              <FocusButton key={value} variant="chip" className="mr-2 mb-2 tv:mr-3 tv:mb-3" active={order === value} onSelect={() => setOrder(value)}>
                {label}
              </FocusButton>
            ))}
          </FocusGroup>

          <FocusGroup className="flex flex-wrap items-center mt-6 tv:mt-8">
            <FocusButton variant="primary" className="mr-5 mb-2" onSelect={() => tracks.length > 0 && setPlaying({ tracks, index: 0 })}>
              <Radio className="w-5 h-5 mr-2 tv:w-7 tv:h-7 tv:mr-3" />
              {tracks.length > 0 ? "Empezar" : "Cargando temas…"}
            </FocusButton>
            <span className="mb-2 text-base text-zinc-400 tv:text-2xl">
              {tracks.length} {tracks.length === 1 ? "tema" : "temas"} de {withThemes} {withThemes === 1 ? "anime" : "animes"}
              {loading && ` · buscando en ${anime.length - loaded.size} más…`}
              {failed && " · AnimeThemes no responde; se usan los que han llegado"}
            </span>
          </FocusGroup>

          <RadioLibrary groups={groups} onPlay={(list, index) => setPlaying({ tracks: list, index })} />
        </>
      )}

      {playing && playing.tracks.length > 0 && (
        <ThemePlayer tracks={playing.tracks} startIndex={playing.index} loop label={radioLabel} onClose={() => setPlaying(null)} />
      )}
    </PageFrame>
  );
}
