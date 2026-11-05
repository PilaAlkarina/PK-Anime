"use client";

import { useMemo } from "react";
import type { FocusDetails } from "@noriginmedia/norigin-spatial-navigation";
import { GENRE_LABELS } from "@/lib/anilist/genres";
import { useMyList } from "@/lib/library/my-list";
import { mergeMyList, REMOTE_STATUS_LABELS, useRemoteLibrary } from "@/lib/library/remote";
import { listStats } from "@/lib/library/stats";
import type { ListStatus } from "@/lib/trackers/types";
import { useIsTv } from "@/components/ui-mode";
import { useTvFocusable } from "./focusable";
import { CardGrid, PageFrame, useMounted, useRevealOnFocus } from "./page-frame";
import { STATUS_STYLES } from "./list-styles";
import { useOpenAnime } from "./browse-screens";
import { cn } from "@/lib/utils";

const STATUS_ORDER: ListStatus[] = ["watching", "completed", "paused", "planning", "dropped"];
const number = new Intl.NumberFormat("es-ES");

/**
 * A block of the page. On TV it takes focus, so the remote scrolls through blocks that have
 * nothing to press.
 */
function Panel({
  title,
  className,
  focusable = true,
  children,
}: {
  title: string;
  className?: string;
  /** Off for a block with its own focusables (cards) */
  focusable?: boolean;
  children: React.ReactNode;
}) {
  const isTv = useIsTv();
  const reveal = useRevealOnFocus();
  const { ref, focused } = useTvFocusable({
    focusable: isTv && focusable,
    onFocus: (layout, _props, details: FocusDetails) => reveal(layout.node, details),
  });
  return (
    <section
      ref={ref}
      className={cn(
        "p-5 rounded-2xl bg-zinc-950 border-[1.5px] border-line tv:p-8 tv:rounded-3xl transition-colors",
        focused && "border-white",
        className
      )}
    >
      <h2 className="text-sm font-bold uppercase tracking-widest text-zinc-500 tv:text-lg">{title}</h2>
      <div className="mt-4 tv:mt-6">{children}</div>
    </section>
  );
}

function BigNumber({ value, label }: { value: string; label: string }) {
  return (
    <div className="flex flex-col">
      <span className="text-3xl font-black tabular-nums md:text-4xl tv:text-6xl">{value}</span>
      <span className="mt-1 text-sm text-zinc-400 tv:text-xl">{label}</span>
    </div>
  );
}

/** One horizontal bar, `share` of the widest */
function Bar({ label, value, share, className }: { label: string; value: string; share: number; className: string }) {
  return (
    <div className="flex items-center text-sm tv:text-xl">
      <span className="w-28 flex-shrink-0 text-zinc-300 tv:w-52">{label}</span>
      <span className="flex-1 h-3 rounded-full bg-white/5 overflow-hidden tv:h-5">
        <span className={cn("block h-full rounded-full origin-left", className)} style={{ transform: `scaleX(${share})` }} />
      </span>
      <span className="w-14 flex-shrink-0 text-right tabular-nums text-zinc-400 tv:w-24">{value}</span>
    </div>
  );
}

/** Estadísticas: what's on the list (both sides), how much was watched and how it was scored */
export function StatsScreen() {
  const mounted = useMounted();
  const openAnime = useOpenAnime();
  const list = useMyList();
  const remote = useRemoteLibrary();
  const stats = useMemo(() => listStats(mergeMyList(list, remote)), [list, remote]);

  const maxGenre = stats.genres[0]?.episodes ?? 1;
  const maxStatus = Math.max(1, ...STATUS_ORDER.map((s) => stats.byStatus[s]));
  const maxScore = Math.max(1, ...stats.scores.slice(1));
  const source = remote ? `Mi lista unida con ${remote.provider.name}` : "Mi lista de este dispositivo";

  return (
    <PageFrame
      title="Estadísticas"
      subtitle={`${source}. Las horas son aproximadas: 24 minutos por episodio y 100 por película.`}
      ready={mounted}
    >
      {stats.total === 0 ? (
        <p className="text-lg text-zinc-400 tv:text-2xl">Aún no hay nada en Mi lista. Añade animes o mira algún episodio.</p>
      ) : (
        <div className="flex flex-col gap-5 tv:gap-8">
          <Panel title="En total">
            <div className="grid grid-cols-2 gap-6 md:grid-cols-4 tv:grid-cols-4 tv:gap-10">
              <BigNumber value={number.format(stats.total)} label="animes en la lista" />
              <BigNumber value={number.format(stats.byStatus.completed)} label="completados" />
              <BigNumber value={number.format(stats.episodes)} label="episodios vistos" />
              <BigNumber value={`≈ ${number.format(stats.hours)} h`} label="de anime" />
            </div>
          </Panel>

          <Panel title={`Tu ${stats.year.year}`} focusable={stats.year.completed === 0}>
            {stats.year.completed === 0 ? (
              <p className="text-zinc-400 tv:text-2xl">Todavía no has terminado ningún anime este año.</p>
            ) : (
              <>
                <p className="text-lg tv:text-3xl">
                  Has terminado <strong>{stats.year.completed}</strong> {stats.year.completed === 1 ? "anime" : "animes"} y{" "}
                  <strong>{number.format(stats.year.episodes)}</strong> episodios.
                </p>
                <p className="mt-1 text-sm text-zinc-500 tv:text-xl">Por la fecha del último cambio de cada uno en la lista.</p>
                <div className="mt-6">
                  <CardGrid
                    cards={stats.year.favorites.slice(0, 12).map(({ item, score }) => ({ item, score }))}
                    onSelect={openAnime}
                  />
                </div>
              </>
            )}
          </Panel>

          <div className="grid gap-5 md:grid-cols-2 tv:grid-cols-2 tv:gap-8">
            <Panel title="Por estado">
              <div className="flex flex-col gap-3 tv:gap-5">
                {STATUS_ORDER.map((status) => (
                  <Bar
                    key={status}
                    label={REMOTE_STATUS_LABELS[status]}
                    value={number.format(stats.byStatus[status])}
                    share={stats.byStatus[status] / maxStatus}
                    className={STATUS_STYLES[status].dot}
                  />
                ))}
              </div>
            </Panel>

            <Panel title="Géneros más vistos">
              {stats.genres.length === 0 ? (
                <p className="text-zinc-400 tv:text-2xl">Sin episodios vistos todavía.</p>
              ) : (
                <div className="flex flex-col gap-3 tv:gap-5">
                  {stats.genres.map((g) => (
                    <Bar
                      key={g.name}
                      label={GENRE_LABELS[g.name] || g.name}
                      value={`${number.format(g.episodes)} ep.`}
                      share={g.episodes / maxGenre}
                      className="bg-red-500"
                    />
                  ))}
                </div>
              )}
            </Panel>
          </div>

          <Panel title="Tus notas">
            {stats.scored === 0 ? (
              <p className="text-zinc-400 tv:text-2xl">Aún no has puntuado ningún anime.</p>
            ) : (
              <>
                <p className="text-lg tv:text-3xl">
                  Media de <strong>{String(stats.meanScore).replace(".", ",")}</strong> en {stats.scored}{" "}
                  {stats.scored === 1 ? "anime puntuado" : "animes puntuados"}.
                </p>
                <div className="flex items-end h-40 mt-6 tv:h-64 tv:mt-8">
                  {stats.scores.slice(1).map((count, i) => {
                    const score = i + 1;
                    return (
                      <div key={score} className="flex flex-col items-center justify-end flex-1 h-full mr-2 last:mr-0 tv:mr-4">
                        <span className="text-xs tabular-nums text-zinc-400 tv:text-lg">{count || ""}</span>
                        <span
                          className={cn(
                            "w-full mt-1 rounded-t-md origin-bottom",
                            score === 10 ? "pk-pill-10" : score === 9 ? "pk-pill-9" : "bg-zinc-600"
                          )}
                          style={{ height: "100%", transform: `scaleY(${Math.max(count / maxScore, 0.02)})` }}
                        />
                        <span className="mt-2 text-sm font-bold tv:text-xl">{score}</span>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </Panel>
        </div>
      )}
    </PageFrame>
  );
}
