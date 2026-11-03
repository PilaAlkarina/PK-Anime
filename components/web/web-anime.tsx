"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Bookmark, BookmarkCheck, Captions, ChevronLeft, ChevronRight, ListPlus, Play } from "lucide-react";
import type { AnimeDetail } from "@/lib/anilist/types";
import { GENRE_LABELS } from "@/lib/anilist/genres";
import { airingLabel, episodesLabel, metaLine, statusLabel } from "@/lib/library/format";
import { continueWatching, episodeProgress, useWatchHistory, WATCHED_FRACTION } from "@/lib/library/history";
import { isInMyList, toggleMyList, useMyList } from "@/lib/library/my-list";
import { findRemoteEntry, REMOTE_STATUS_LABELS, remoteNextEpisode, useRemoteLibrary } from "@/lib/library/remote";
import { addToRemotePlan } from "@/lib/library/sync";
import { setAudioPreference, useAudioPreference } from "@/lib/library/preferences";
import { usePlaybackPreferences } from "@/lib/playback-preferences";
import { subtitleLanguageName } from "@/components/player/player-core/subtitle-language";
import { useLibraryNavigation } from "@/components/tv/navigation-provider";
import { HorizontalRow } from "./horizontal-row";
import { PosterCard } from "./poster-card";
import { cn } from "@/lib/utils";

const EPISODES_PER_RANGE = 50;

// Same relation set as the TV screen: CHARACTER and OTHER only link loosely related shows
const RELATION_LABELS: Record<string, string> = {
  PREQUEL: "Precuela",
  SEQUEL: "Secuela",
  PARENT: "Historia principal",
  SIDE_STORY: "Historia paralela",
  SPIN_OFF: "Spin-off",
  ALTERNATIVE: "Versión alternativa",
  SUMMARY: "Resumen",
  COMPILATION: "Recopilación",
  CONTAINS: "Incluye",
};

function episodeInfo(anime: AnimeDetail) {
  const info = new Map<number, { title: string; thumbnail: string | null }>();
  for (const ep of anime.streamingEpisodes) {
    const match = ep.title.match(/^Episode\s+(\d+)\s*[-–:]?\s*(.*)$/i);
    if (match) info.set(Number(match[1]), { title: match[2].trim(), thumbnail: ep.thumbnail });
  }
  return info;
}

function EpisodeItem({
  number,
  title,
  thumbnail,
  progress,
  duration,
  href,
}: {
  number: number;
  title?: string;
  thumbnail?: string | null;
  progress: number;
  duration: number | null;
  href: string;
}) {
  const watched = progress >= WATCHED_FRACTION;
  const status = watched
    ? "Visto"
    : progress > 0 && duration
      ? `Quedan ${Math.max(1, Math.round(duration * (1 - progress)))} min`
      : duration
        ? `${duration} min`
        : null;

  return (
    <Link
      id={`ep-${number}`}
      href={href}
      className="group flex items-center gap-3 sm:flex-col sm:items-stretch sm:gap-2 scroll-mt-24 outline-none"
    >
      <div className="relative flex-shrink-0 w-32 h-[4.5rem] sm:w-full sm:h-auto sm:pt-[56.25%] rounded-lg sm:rounded-xl overflow-hidden bg-zinc-900 group-focus-visible:ring-2 group-focus-visible:ring-white">
        {thumbnail ? (
          <img src={thumbnail} alt="" loading="lazy" decoding="async" className="absolute top-0 left-0 w-full h-full object-cover" />
        ) : (
          <span className="absolute top-0 left-0 flex items-center justify-center w-full h-full text-2xl sm:text-4xl font-bold text-white/25">
            {number}
          </span>
        )}
        <span className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 hidden sm:flex items-center justify-center w-10 h-10 rounded-full bg-black/70 opacity-0 group-hover:opacity-100 transition-opacity">
          <Play className="w-4 h-4 ml-0.5" fill="currentColor" />
        </span>
        {watched && (
          <span className="absolute top-1.5 left-1.5 px-1.5 py-0.5 rounded-md bg-black/80 text-[0.7rem] font-bold">Visto</span>
        )}
        {progress > 0 && (
          <div className="absolute left-0 right-0 bottom-0 h-1 bg-white/25">
            <div className="h-full bg-red-600" style={{ width: `${Math.round(progress * 100)}%` }} />
          </div>
        )}
      </div>
      <span className="flex flex-col gap-0.5 min-w-0">
        <span className="text-sm font-semibold line-clamp-2 group-hover:text-white text-zinc-100">
          {number}. {title || `Episodio ${number}`}
        </span>
        {status && <span className="text-xs text-zinc-400">{status}</span>}
      </span>
    </Link>
  );
}

/** Anime page for computers and phones */
export function WebAnimeScreen({ anime }: { anime: AnimeDetail }) {
  const { goBack } = useLibraryNavigation();
  const audio = useAudioPreference();
  const prefs = usePlaybackPreferences();
  const myList = useMyList();
  const history = useWatchHistory();
  const remote = useRemoteLibrary();
  const inMyList = isInMyList(myList, anime.id);
  const [adding, setAdding] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [hideWatched, setHideWatched] = useState(false);
  const [jump, setJump] = useState("");

  const total = anime.availableEpisodes ?? anime.episodes ?? anime.streamingEpisodes.length;
  const titles = useMemo(() => episodeInfo(anime), [anime]);

  const entry = history.find((e) => e.anime.id === anime.id);
  const resume = useMemo(
    () =>
      entry
        ? continueWatching([{ ...entry, anime: { ...entry.anime, availableEpisodes: total, episodes: anime.episodes } }])[0]
        : undefined,
    [entry, total, anime.episodes]
  );
  const remoteEntry = findRemoteEntry(remote, anime);
  const remoteNext = remoteNextEpisode(remoteEntry, { availableEpisodes: total, episodes: anime.episodes });
  const playEpisode = Math.max(resume?.episode ?? 0, remoteNext ?? 0) || 1;
  const continuing = !!resume && resume.episode === playEpisode && resume.progress > 0;
  const remaining =
    continuing && anime.duration ? Math.max(1, Math.round(anime.duration * (1 - (resume?.progress ?? 0)))) : null;

  const [range, setRange] = useState(0);
  useEffect(() => {
    if (playEpisode > 1) setRange(Math.floor((playEpisode - 1) / EPISODES_PER_RANGE));
  }, [playEpisode]);

  const watchHref = (episode: number) => `/watch/${anime.id}/${episode}?audio=${audio}`;
  const progressOf = (number: number) =>
    Math.max(entry ? episodeProgress(anime.id, number) : 0, remoteEntry && remoteEntry.progress >= number ? 1 : 0);

  const rangeCount = Math.ceil(total / EPISODES_PER_RANGE);
  const firstInRange = range * EPISODES_PER_RANGE + 1;
  const episodes = Array.from(
    { length: Math.max(0, Math.min(EPISODES_PER_RANGE, total - firstInRange + 1)) },
    (_, i) => firstInRange + i
  ).filter((n) => !hideWatched || progressOf(n) < WATCHED_FRACTION);
  const watchedCount = Array.from({ length: total }, (_, i) => i + 1).filter((n) => progressOf(n) >= WATCHED_FRACTION).length;

  const goToEpisode = (value: string) => {
    const n = Number(value);
    if (!Number.isInteger(n) || n < 1 || n > total) return;
    setHideWatched(false);
    setRange(Math.floor((n - 1) / EPISODES_PER_RANGE));
    requestAnimationFrame(() => document.getElementById(`ep-${n}`)?.scrollIntoView({ behavior: "smooth", block: "center" }));
  };

  const addToRemote = async () => {
    if (adding) return;
    setAdding(true);
    await addToRemotePlan(anime);
    setAdding(false);
  };

  const relations = anime.relations.filter((r) => RELATION_LABELS[r.relationType]);
  const subtitle = anime.romajiTitle && anime.romajiTitle !== anime.title ? anime.romajiTitle : anime.nativeTitle;
  const image = anime.banner || anime.cover;
  const subtitlesLabel = !prefs.subtitlesEnabled
    ? "Desactivados"
    : prefs.subtitleLanguages.length
      ? subtitleLanguageName(prefs.subtitleLanguages[0])
      : "Los del servidor";

  return (
    <div className="pb-12">
      <div className="relative h-56 md:h-[21rem] overflow-hidden bg-zinc-900">
        {image && (
          <img
            src={image}
            alt=""
            decoding="async"
            className={cn("w-full h-full object-cover tv-fade-in", !anime.banner && "opacity-40 blur-sm scale-110")}
          />
        )}
        <div className="absolute left-0 right-0 bottom-0 h-3/4 bg-gradient-to-t from-black to-transparent" />
        <button
          type="button"
          onClick={goBack}
          aria-label="Volver"
          className="md:hidden absolute top-3 left-3 flex items-center justify-center w-11 h-11 rounded-full bg-black/70"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
      </div>

      <div className="relative max-w-[1360px] mx-auto px-4 md:px-8 -mt-16 md:-mt-48">
        <section className="flex flex-wrap items-start gap-8">
          {anime.cover && (
            <img
              src={anime.cover}
              alt=""
              decoding="async"
              className="hidden md:block w-[13.75rem] rounded-2xl shadow-[0_1.25rem_3rem_rgba(0,0,0,0.6)]"
            />
          )}
          <div className="flex flex-col gap-3 flex-[999_1_34rem] min-w-0">
            <nav aria-label="Ruta" className="hidden md:block text-sm text-zinc-400">
              <Link href="/" className="hover:text-white">
                Inicio
              </Link>{" "}
              / <span className="text-zinc-300">{anime.title}</span>
            </nav>
            <h1 className="text-[1.6rem] md:text-[2.6rem] leading-tight font-extrabold tracking-tight">{anime.title}</h1>
            {subtitle && <p className="-mt-1.5 text-sm md:text-base text-zinc-400">{subtitle}</p>}
            <p className="text-sm md:text-[0.95rem] text-zinc-300">{metaLine(anime)}</p>
            {(anime.genres.length > 0 || anime.tags.length > 0) && (
              <div className="flex flex-wrap gap-2">
                {/* Each one opens the advanced search with it applied, ready to refine */}
                {anime.genres.map((g) => (
                  <Link
                    key={g}
                    href={`/search?genre=${encodeURIComponent(g)}`}
                    className="px-3 py-1 rounded-full bg-zinc-800 text-xs md:text-sm text-zinc-200 hover:bg-zinc-700"
                  >
                    {GENRE_LABELS[g] || g}
                  </Link>
                ))}
                {anime.tags.map((t) => (
                  <Link
                    key={t}
                    href={`/search?tag=${encodeURIComponent(t)}`}
                    className="px-3 py-1 rounded-full border border-zinc-800 text-xs md:text-sm text-zinc-400 hover:text-white hover:border-zinc-600"
                  >
                    #{t}
                  </Link>
                ))}
              </div>
            )}

            {total > 0 && (
              <div className="flex flex-wrap items-center gap-2.5 mt-2">
                <Link
                  href={watchHref(playEpisode)}
                  className="flex items-center justify-center gap-2 w-full sm:w-auto h-12 px-6 rounded-xl sm:rounded-full bg-white text-black font-bold hover:bg-zinc-200"
                >
                  <Play className="w-4 h-4" fill="currentColor" />
                  {continuing ? `Continuar EP ${playEpisode}` : `Ver EP ${playEpisode}`}
                  {remaining && <span className="font-medium text-zinc-600">· quedan {remaining} min</span>}
                </Link>
                <div role="group" aria-label="Audio" className="flex flex-1 sm:flex-none p-1 rounded-xl sm:rounded-full bg-zinc-900 border border-zinc-800">
                  {(["sub", "dub"] as const).map((value) => (
                    <button
                      key={value}
                      type="button"
                      aria-pressed={audio === value}
                      onClick={() => setAudioPreference(value)}
                      className={cn(
                        "flex-1 h-10 px-4 rounded-lg sm:rounded-full text-sm",
                        audio === value ? "bg-zinc-700 text-white font-semibold" : "text-zinc-400 hover:text-white"
                      )}
                    >
                      {value === "sub" ? "Original" : "Doblaje"}
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={() => toggleMyList(anime)}
                  aria-pressed={inMyList}
                  className="flex items-center gap-2 h-12 px-4 rounded-xl sm:rounded-full border border-zinc-700 text-sm font-semibold hover:bg-zinc-800"
                >
                  {inMyList ? <BookmarkCheck className="w-5 h-5" /> : <Bookmark className="w-5 h-5" />}
                  {inMyList ? "En mi lista" : "Mi lista"}
                </button>
                {remote && !remoteEntry && (
                  <button
                    type="button"
                    onClick={addToRemote}
                    className="flex items-center gap-2 h-12 px-4 rounded-xl sm:rounded-full border border-zinc-700 text-sm font-semibold hover:bg-zinc-800"
                  >
                    <ListPlus className="w-5 h-5" />
                    {adding ? "Añadiendo…" : `Añadir a ${remote.provider.name}`}
                  </button>
                )}
              </div>
            )}

            <Link
              href="/settings"
              className="flex items-center gap-2.5 h-12 px-3.5 rounded-xl bg-zinc-900 text-sm sm:h-auto sm:px-0 sm:bg-transparent sm:text-zinc-400 hover:text-white"
            >
              <Captions className="w-5 h-5 flex-shrink-0" />
              <span className="flex-1 sm:flex-none">Subtítulos: {subtitlesLabel}</span>
              <span className="hidden sm:inline text-zinc-500">· Cambiar en Ajustes</span>
              <ChevronRight className="w-4 h-4 sm:hidden text-zinc-500" />
            </Link>
            {remote && remoteEntry && (
              <p className="text-sm text-zinc-400">
                En {remote.provider.name}: {REMOTE_STATUS_LABELS[remoteEntry.status]}
                {remoteEntry.progress > 0 &&
                  ` · ${remoteEntry.progress}${anime.episodes ? ` de ${anime.episodes}` : ""} episodios vistos`}
              </p>
            )}

            {anime.description && (
              <div className="max-w-3xl">
                <p className={cn("text-sm md:text-[0.95rem] leading-relaxed text-zinc-300", !expanded && "line-clamp-3 md:line-clamp-none")}>
                  {anime.description}
                </p>
                <button
                  type="button"
                  onClick={() => setExpanded((v) => !v)}
                  className="md:hidden mt-1 text-sm font-semibold text-zinc-200"
                >
                  {expanded ? "Menos" : "Más"}
                </button>
              </div>
            )}
            {anime.nextEpisode && (
              <p className="text-sm text-zinc-300">
                {anime.status === "NOT_YET_RELEASED" && anime.nextEpisode.episode === 1
                  ? `Se estrena ${airingLabel(anime.nextEpisode.airingAt)}`
                  : `Episodio ${anime.nextEpisode.episode} ${airingLabel(anime.nextEpisode.airingAt)}`}
              </p>
            )}
          </div>
        </section>

        <div className="flex flex-wrap items-start gap-10 mt-10 md:mt-12">
          {total > 0 && (
            <section className="flex-[999_1_40rem] min-w-0">
              <div className="flex flex-wrap items-center gap-3 mb-4">
                <h2 className="mr-auto text-lg md:text-[1.35rem] font-bold">
                  Episodios <span className="font-medium text-zinc-400">· {total}</span>
                  {watchedCount > 0 && <span className="ml-2 text-sm font-medium text-zinc-500">{watchedCount} vistos</span>}
                </h2>
                <label className="flex items-center gap-2 text-sm text-zinc-300">
                  <input
                    type="checkbox"
                    checked={hideWatched}
                    onChange={(e) => setHideWatched(e.target.checked)}
                    className="w-4 h-4 accent-red-600"
                  />
                  Ocultar vistos
                </label>
                {total > 12 && (
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      goToEpisode(jump);
                    }}
                    className="flex items-center gap-2 h-10 px-3 rounded-lg bg-zinc-900 border border-zinc-800 text-sm text-zinc-400"
                  >
                    <label htmlFor="jump-episode">Ir al episodio</label>
                    <input
                      id="jump-episode"
                      type="number"
                      inputMode="numeric"
                      min={1}
                      max={total}
                      value={jump}
                      onChange={(e) => setJump(e.target.value)}
                      placeholder={String(playEpisode)}
                      className="w-14 bg-transparent font-semibold text-white outline-none"
                    />
                  </form>
                )}
              </div>
              {rangeCount > 1 && (
                <div className="flex flex-wrap gap-2 mb-5">
                  {Array.from({ length: rangeCount }, (_, i) => {
                    const from = i * EPISODES_PER_RANGE + 1;
                    const to = Math.min(total, from + EPISODES_PER_RANGE - 1);
                    return (
                      <button
                        key={i}
                        type="button"
                        aria-pressed={i === range}
                        onClick={() => setRange(i)}
                        className={cn(
                          "h-9 px-4 rounded-full text-sm",
                          i === range ? "bg-white text-black font-semibold" : "bg-zinc-800 text-zinc-300 hover:bg-zinc-700"
                        )}
                      >
                        {from}–{to}
                      </button>
                    );
                  })}
                </div>
              )}
              {episodes.length === 0 ? (
                <p className="text-sm text-zinc-400">Has visto todos los episodios de este bloque.</p>
              ) : (
                <div className="grid gap-3 sm:gap-x-4 sm:gap-y-6 sm:grid-cols-[repeat(auto-fill,minmax(14rem,1fr))]">
                  {episodes.map((number) => (
                    <EpisodeItem
                      key={number}
                      number={number}
                      title={titles.get(number)?.title}
                      thumbnail={titles.get(number)?.thumbnail}
                      progress={progressOf(number)}
                      duration={anime.duration}
                      href={watchHref(number)}
                    />
                  ))}
                </div>
              )}
            </section>
          )}

          <aside className="flex flex-col gap-7 flex-[1_1_18rem] min-w-0">
            <section className="p-5 rounded-2xl bg-zinc-950 border border-zinc-900">
              <h2 className="mb-3 font-bold">Información</h2>
              <dl className="grid grid-cols-[7rem_minmax(0,1fr)] gap-y-2.5 text-sm">
                {[
                  ["Estado", statusLabel(anime.status)],
                  ["Episodios", episodesLabel(anime)],
                  ["Duración", anime.duration ? `${anime.duration} min` : null],
                  ["Estudio", anime.studios.join(", ") || null],
                  ["Año", anime.seasonYear ? String(anime.seasonYear) : null],
                  ["Puntuación", anime.score ? `${anime.score} %` : null],
                ]
                  .filter(([, value]) => value)
                  .map(([label, value]) => (
                    <div key={label} className="contents">
                      <dt className="text-zinc-400">{label}</dt>
                      <dd>{value}</dd>
                    </div>
                  ))}
              </dl>
            </section>
            {relations.length > 0 && (
              <section>
                <h2 className="mb-3 font-bold">Relacionados</h2>
                <div className="flex flex-col gap-2">
                  {relations.map((r) => (
                    <Link
                      key={`${r.relationType}-${r.item.id}`}
                      href={`/anime/${r.item.id}`}
                      className="flex items-center gap-3 p-2 rounded-xl bg-zinc-950 hover:bg-zinc-900"
                    >
                      <span
                        className="w-11 h-[3.9rem] flex-shrink-0 rounded-lg overflow-hidden bg-zinc-800"
                        style={r.item.color ? { backgroundColor: r.item.color } : undefined}
                      >
                        {r.item.cover && <img src={r.item.cover} alt="" loading="lazy" className="w-full h-full object-cover" />}
                      </span>
                      <span className="flex flex-col gap-0.5 min-w-0">
                        <span className="text-sm font-semibold line-clamp-2">{r.item.title}</span>
                        <span className="text-xs text-zinc-400">
                          {[RELATION_LABELS[r.relationType], r.item.seasonYear].filter(Boolean).join(" · ")}
                        </span>
                      </span>
                    </Link>
                  ))}
                </div>
              </section>
            )}
          </aside>
        </div>
      </div>

      {anime.recommendations.length > 0 && (
        <div className="max-w-[1360px] mx-auto mt-12">
          <HorizontalRow title="Recomendados">
            {anime.recommendations.map((item) => (
              <div key={item.id} className="flex-shrink-0 w-[7.5rem] md:w-[10.5rem] snap-start">
                <PosterCard item={item} />
              </div>
            ))}
          </HorizontalRow>
        </div>
      )}
    </div>
  );
}
