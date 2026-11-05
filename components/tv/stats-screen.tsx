"use client";

import { useMemo, useState } from "react";
import type { FocusDetails } from "@noriginmedia/norigin-spatial-navigation";
import { GENRE_LABELS } from "@/lib/anilist/genres";
import { useMyList } from "@/lib/library/my-list";
import { mergeMyList, REMOTE_STATUS_LABELS, useRemoteLibrary } from "@/lib/library/remote";
import { listStats, STATUS_HEX, STATUS_ORDER, statsYears, type StatsPeriod } from "@/lib/library/stats";
import { useIsTv } from "@/components/ui-mode";
import { FocusButton, FocusGroup, useTvFocusable } from "./focusable";
import { CardGrid, PageFrame, useMounted, useRevealOnFocus } from "./page-frame";
import { useOpenAnime } from "./browse-screens";
import { cn } from "@/lib/utils";

const number = new Intl.NumberFormat("es-ES");
const percent = (part: number, total: number) => (total ? Math.round((part / total) * 100) : 0);
const MAX_YEARS = 8;

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
function Bar({ label, value, share, color }: { label: string; value: string; share: number; color?: string }) {
  return (
    <div className="flex items-center text-sm tv:text-xl">
      <span className="w-28 flex-shrink-0 text-zinc-300 tv:w-52">{label}</span>
      <span className="flex-1 h-3 rounded-full bg-white/5 overflow-hidden tv:h-5">
        <span
          className={cn("block h-full rounded-full origin-left", !color && "bg-red-500")}
          style={{ transform: `scaleX(${share})`, backgroundColor: color }}
        />
      </span>
      <span className="w-16 flex-shrink-0 text-right tabular-nums text-zinc-400 tv:w-24">{value}</span>
    </div>
  );
}

/**
 * Statuses as one bar split by share, with a legend of counts and percentages: with most of a
 * list completed, separate bars leave the rest as slivers
 */
function StatusBreakdown({ byStatus, total }: { byStatus: Record<string, number>; total: number }) {
  const present = STATUS_ORDER.filter((s) => byStatus[s] > 0);
  return (
    <>
      <div className="flex h-5 rounded-full overflow-hidden bg-white/5 tv:h-8" aria-hidden>
        {present.map((status) => (
          <span
            key={status}
            className="h-full border-r-2 border-zinc-950 last:border-r-0"
            style={{ width: `${(byStatus[status] / total) * 100}%`, minWidth: "0.5rem", backgroundColor: STATUS_HEX[status] }}
          />
        ))}
      </div>
      <ul className="grid grid-cols-2 mt-5 sm:grid-cols-3 tv:grid-cols-5 tv:mt-7">
        {STATUS_ORDER.map((status) => (
          <li key={status} className="flex items-start mb-4 mr-3 tv:mb-0">
            <span className="w-3 h-3 mt-1.5 mr-2.5 rounded-full flex-shrink-0 tv:w-4 tv:h-4 tv:mt-2.5" style={{ backgroundColor: STATUS_HEX[status] }} />
            <span className="flex flex-col">
              <span className="text-sm text-zinc-400 tv:text-xl">{REMOTE_STATUS_LABELS[status]}</span>
              <span className="text-xl font-black tabular-nums tv:text-4xl">
                {number.format(byStatus[status])}
                <span className="ml-1.5 text-sm font-bold text-zinc-500 tv:text-xl">{percent(byStatus[status], total)} %</span>
              </span>
            </span>
          </li>
        ))}
      </ul>
    </>
  );
}

/** Vertical bars with their value on top and a label under each */
function Columns({ data, highlight }: { data: { label: string; count: number }[]; highlight?: (i: number) => string | undefined }) {
  const max = Math.max(1, ...data.map((d) => d.count));
  return (
    <div className="flex items-end h-40 tv:h-64">
      {data.map(({ label, count }, i) => (
        <div key={label} className="flex flex-col items-center justify-end flex-1 h-full min-w-0 mr-1.5 last:mr-0 tv:mr-3">
          <span className="text-xs tabular-nums text-zinc-400 tv:text-lg">{count || ""}</span>
          <span
            className={cn("w-full mt-1 rounded-t-md origin-bottom", highlight?.(i) ?? "bg-zinc-600")}
            style={{ height: "100%", transform: `scaleY(${Math.max(count / max, 0.02)})` }}
          />
          <span className="mt-2 text-xs font-bold text-zinc-300 truncate max-w-full tv:text-lg">{label}</span>
        </div>
      ))}
    </div>
  );
}

/** Estadísticas: what's on the list (both sides), how much was watched and how it was scored */
export function StatsScreen() {
  const mounted = useMounted();
  const isTv = useIsTv();
  const openAnime = useOpenAnime();
  const list = useMyList();
  const remote = useRemoteLibrary();
  const items = useMemo(() => mergeMyList(list, remote), [list, remote]);
  const years = useMemo(() => statsYears(items).slice(0, MAX_YEARS), [items]);
  const [period, setPeriod] = useState<StatsPeriod>("all");
  const stats = useMemo(() => listStats(items, period), [items, period]);

  const maxGenre = stats.genres[0]?.episodes ?? 1;
  const maxFormat = stats.formats[0]?.count ?? 1;
  const source = remote ? `Mi lista unida con ${remote.provider.name}` : "Mi lista de este dispositivo";
  const inPeriod = period === "all" ? "" : ` en ${period}`;

  return (
    <PageFrame
      title="Estadísticas"
      subtitle={`${source}. Un año reúne lo que terminaste ese año y lo que cambiaste en la lista ese año. Las horas son aproximadas: 24 minutos por episodio y 100 por película.`}
      ready={mounted}
    >
      {years.length > 0 && (
        <FocusGroup className="flex flex-wrap mb-6 tv:mb-8">
          {(["all", ...years] as StatsPeriod[]).map((value) => (
            <FocusButton
              key={value}
              variant="chip"
              className="mr-2 mb-2 tv:mr-3 tv:mb-3"
              active={period === value}
              onSelect={() => setPeriod(value)}
            >
              {value === "all" ? "Total" : value}
            </FocusButton>
          ))}
        </FocusGroup>
      )}

      {stats.total === 0 ? (
        <p className="text-lg text-zinc-400 tv:text-2xl">
          {period === "all" ? "Aún no hay nada en Mi lista. Añade animes o mira algún episodio." : `Nada en ${period}.`}
        </p>
      ) : (
        <div className="flex flex-col gap-5 tv:gap-8">
          <Panel title={period === "all" ? "En total" : `En ${period}`}>
            <div className="grid grid-cols-2 gap-6 md:grid-cols-5 tv:grid-cols-5 tv:gap-10">
              <BigNumber value={number.format(stats.total)} label={period === "all" ? "animes en la lista" : "animes"} />
              <BigNumber value={number.format(stats.completed)} label="completados" />
              <BigNumber value={number.format(stats.episodes)} label="episodios vistos" />
              <BigNumber value={`≈ ${number.format(stats.hours)} h`} label="de anime" />
              <BigNumber value={stats.meanScore ? String(stats.meanScore).replace(".", ",") : "—"} label="nota media" />
            </div>
          </Panel>

          <Panel title="Por estado">
            <StatusBreakdown byStatus={stats.byStatus} total={stats.total} />
          </Panel>

          <div className="grid gap-5 md:grid-cols-2 tv:grid-cols-2 tv:gap-8">
            <Panel title={period === "all" ? "Terminados por año" : `Terminados por mes en ${period}`}>
              {stats.timeline.every((t) => t.count === 0) ? (
                <p className="text-zinc-400 tv:text-2xl">Ningún anime terminado{inPeriod}.</p>
              ) : (
                <Columns
                  data={stats.timeline}
                  // The current year, or month, stands out
                  highlight={(i) => {
                    const now = new Date();
                    const current =
                      period === "all" ? stats.timeline[i].label === String(now.getFullYear()) : period === now.getFullYear() && i === now.getMonth();
                    return current ? "bg-red-500" : undefined;
                  }}
                />
              )}
            </Panel>

            <Panel title="Formatos">
              <div className="flex flex-col gap-3 tv:gap-5">
                {stats.formats.map((f) => (
                  <Bar key={f.label} label={f.label} value={number.format(f.count)} share={f.count / maxFormat} color="#a78bfa" />
                ))}
              </div>
            </Panel>
          </div>

          <div className="grid gap-5 md:grid-cols-2 tv:grid-cols-2 tv:gap-8">
            <Panel title="Géneros más vistos">
              {stats.genres.length === 0 ? (
                <p className="text-zinc-400 tv:text-2xl">Sin episodios vistos{inPeriod}.</p>
              ) : (
                <div className="flex flex-col gap-3 tv:gap-5">
                  {stats.genres.map((g) => (
                    <Bar
                      key={g.name}
                      label={GENRE_LABELS[g.name] || g.name}
                      value={`${number.format(g.episodes)} ep.`}
                      share={g.episodes / maxGenre}
                    />
                  ))}
                </div>
              )}
            </Panel>

            <Panel title="Tus notas">
              {stats.scored === 0 ? (
                <p className="text-zinc-400 tv:text-2xl">Sin animes puntuados{inPeriod}.</p>
              ) : (
                <>
                  <p className="mb-5 text-base text-zinc-300 tv:text-2xl">
                    {stats.scored} {stats.scored === 1 ? "anime puntuado" : "animes puntuados"}
                  </p>
                  <Columns
                    data={stats.scores.slice(1).map((count, i) => ({ label: String(i + 1), count }))}
                    highlight={(i) => (i === 9 ? "pk-pill-10" : i === 8 ? "pk-pill-9" : undefined)}
                  />
                </>
              )}
            </Panel>
          </div>

          <Panel title={period === "all" ? "Tus favoritos" : `Tus favoritos de ${period}`} focusable={stats.favorites.length === 0}>
            {stats.favorites.length === 0 ? (
              <p className="text-zinc-400 tv:text-2xl">Ningún anime terminado{inPeriod}.</p>
            ) : (
              <CardGrid
                cards={stats.favorites.slice(0, isTv ? 12 : 18).map(({ item, score }) => ({ item, score }))}
                onSelect={openAnime}
              />
            )}
          </Panel>
        </div>
      )}
    </PageFrame>
  );
}
