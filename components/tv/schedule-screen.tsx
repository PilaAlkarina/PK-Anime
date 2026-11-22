"use client";

import { forwardRef, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { setFocus } from "@noriginmedia/norigin-spatial-navigation";
import { Check, ChevronLeft, ChevronRight, ChevronsLeft, Clock, Pause, Play } from "lucide-react";
import { useIsTv } from "@/components/ui-mode";
import type { CatalogItem, ScheduleEntry } from "@/lib/anilist/types";
import { formatTime, startOfDay } from "@/lib/library/format";
import { freshen, useFreshCards } from "@/lib/library/fresh-cards";
import { useWatchHistory, watchedEpisodes } from "@/lib/library/history";
import { useMyList } from "@/lib/library/my-list";
import { mergeMyList, REMOTE_STATUS_LABELS, useRemoteLibrary } from "@/lib/library/remote";
import {
  catchUpList,
  countdownLabel,
  episodeState,
  isActive,
  isFinale,
  isPremiere,
  matchesView,
  restsInWindow,
  summarizeWeek,
  updateScheduleView,
  useScheduleView,
  type EpisodeState,
  type MyEntry,
  type RestSlot,
  type WeekSummary,
} from "@/lib/library/schedule";
import { FocusButton, FocusGroup, useTvFocusable } from "./focusable";
import { STATUS_STYLES } from "./list-styles";
import { PageFrame, useMounted, useRevealOnFocus } from "./page-frame";
import { cn } from "@/lib/utils";

/**
 * The calendar: seven days of episodes from today, or the week before or after, in the viewer's
 * time zone. Each episode says what it means for you (watched, out, behind on it, in 20 min),
 * your shows that skip a week keep their slot, and a filter keeps only your list.
 *
 * TV browsers here can be old Chromium, so spacing uses margins, not flex gap.
 */

const MAX_WEEKS_AWAY = 1;
const DAY_COUNT = 7;

/** The time, ticking every minute, so "en 20 min" and "ya emitido" stay true while the page is open */
function useNow() {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(timer);
  }, []);
  return now;
}

/** Your list (this device's and the service's) and the watch history, as one entry per anime */
function useMyEntries() {
  const local = useMyList();
  const remote = useRemoteLibrary();
  const history = useWatchHistory();
  const merged = useMemo(() => mergeMyList(local, remote), [local, remote]);

  const mine = useMemo(() => {
    const map = new Map<number, MyEntry>();
    for (const h of history) map.set(h.anime.id, { status: null, watched: Math.max(0, watchedEpisodes(h)) });
    for (const { item, entry } of merged) {
      const seen = map.get(item.id)?.watched ?? 0;
      map.set(item.id, { status: entry?.status ?? null, watched: Math.max(seen, entry?.progress ?? 0) });
    }
    return map;
  }, [history, merged]);

  // Current cards for the shows you follow: the saved ones don't know about breaks or new episodes
  const following = useMemo(
    () => merged.filter(({ item, entry }) => isActive({ status: entry?.status ?? null, watched: 0 }) && item.id > 0),
    [merged]
  );
  const fresh = useFreshCards(following.map(({ item }) => item.id));
  const anime = useMemo(() => following.map(({ item }) => freshen(fresh, item)), [following, fresh]);
  return { mine, anime };
}

type WeekData = ScheduleEntry[] | "failed";

/** Each week's schedule, fetched once per visit */
function useWeek(from: number, to: number, enabled: boolean) {
  const [weeks, setWeeks] = useState<Record<number, WeekData>>({});
  const loaded = weeks[from];

  useEffect(() => {
    if (!enabled || loaded) return;
    const ctrl = new AbortController();
    fetch(`/api/catalog/schedule?from=${Math.floor(from / 1000)}&to=${Math.floor(to / 1000)}`, { signal: ctrl.signal })
      .then((res) => res.json())
      .then((data) => {
        if (!data.success) throw new Error(data.error);
        // The API snaps its range outward, so keep only this week's
        const entries = (data.entries as ScheduleEntry[])
          .filter((e) => e.airingAt * 1000 >= from && e.airingAt * 1000 < to)
          .sort((a, b) => a.airingAt - b.airingAt);
        setWeeks((w) => ({ ...w, [from]: entries }));
      })
      .catch((err) => {
        if (err?.name !== "AbortError") setWeeks((w) => ({ ...w, [from]: "failed" }));
      });
    return () => ctrl.abort();
  }, [from, to, enabled, loaded]);

  return loaded;
}

const shortWeekday = new Intl.DateTimeFormat("es", { weekday: "short" });
const longWeekday = new Intl.DateTimeFormat("es", { weekday: "long" });
const shortDate = new Intl.DateTimeFormat("es", { day: "numeric", month: "short" });

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const weekdayShort = (date: Date) => capitalize(shortWeekday.format(date).replace(".", ""));

function dayName(day: Date, today: number) {
  const diff = Math.round((startOfDay(day) - today) / 86_400_000);
  if (diff === 0) return "Hoy";
  if (diff === 1) return "Mañana";
  if (diff === -1) return "Ayer";
  return `${weekdayShort(day)} ${day.getDate()}`;
}

function weekRange(days: Date[]) {
  const first = days[0];
  const last = days[days.length - 1];
  const month = (d: Date) => shortDate.format(d).replace(/^\d+\s*/, "").replace(".", "");
  return first.getMonth() === last.getMonth()
    ? `${first.getDate()} – ${last.getDate()} ${month(last)}`
    : `${first.getDate()} ${month(first)} – ${last.getDate()} ${month(last)}`;
}

const weekName = (offset: number) => (offset === 0 ? "Próximos 7 días" : offset < 0 ? "Semana anterior" : "Semana siguiente");

/** "vuelve el miércoles 2 dic. con el EP 8" */
function returnLabel({ returns }: RestSlot) {
  const date = new Date(returns.airingAt * 1000);
  return `vuelve el ${longWeekday.format(date)} ${shortDate.format(date)} con el EP ${returns.episode}`;
}

type AgendaItem = { kind: "episode"; at: number; entry: ScheduleEntry } | { kind: "rest"; at: number; rest: RestSlot };

export function ScheduleScreen() {
  const isTv = useIsTv();
  const router = useRouter();
  // Days depend on the viewer's clock and time zone, so they're only computed in the browser
  const mounted = useMounted();
  const now = useNow();
  const today = startOfDay(new Date(now));
  const [offset, setOffset] = useState(0);
  const [selected, setSelected] = useState(0);
  const view = useScheduleView();
  const { mine, anime } = useMyEntries();

  const days = useMemo(() => {
    const start = new Date(today);
    return Array.from(
      { length: DAY_COUNT },
      (_, i) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + offset * DAY_COUNT + i)
    );
  }, [today, offset]);
  const from = days[0].getTime();
  const to = new Date(days[0].getFullYear(), days[0].getMonth(), days[0].getDate() + DAY_COUNT).getTime();
  const week = useWeek(from, to, mounted);
  const entries = Array.isArray(week) ? week : null;

  const shown = useMemo(
    () => (entries ?? []).filter((e) => matchesView(mine.get(e.anime.id), view)),
    [entries, mine, view]
  );
  const rests = useMemo(
    () =>
      entries
        ? restsInWindow(anime, entries, from, to, now).filter((r) => matchesView(mine.get(r.anime.id), view))
        : [],
    [anime, entries, from, to, now, mine, view]
  );
  const summary = useMemo(() => summarizeWeek(entries ?? [], mine, now), [entries, mine, now]);
  const catchUp = useMemo(() => catchUpList(anime, mine, now), [anime, mine, now]);

  const dayStart = days[selected].getTime();
  const isToday = dayStart === today;
  const agenda: AgendaItem[] = [
    ...shown
      .filter((e) => startOfDay(new Date(e.airingAt * 1000)) === dayStart)
      .map((entry): AgendaItem => ({ kind: "episode", at: entry.airingAt * 1000, entry })),
    ...rests
      .filter((r) => startOfDay(new Date(r.slot)) === dayStart)
      .map((rest): AgendaItem => ({ kind: "rest", at: rest.slot, rest })),
  ].sort((a, b) => a.at - b.at);
  const nowIndex = isToday ? agenda.findIndex((item) => item.at > now) : -1;
  const nextUp = nowIndex >= 0 ? agenda.slice(nowIndex).find((i) => i.kind === "episode") : undefined;

  const changeWeek = (step: number) => {
    setOffset((o) => Math.max(-MAX_WEEKS_AWAY, Math.min(MAX_WEEKS_AWAY, o + step)));
    setSelected(0);
  };

  // Opens on what comes next: the TV focuses it, the web scrolls to "ahora" when it's below the fold
  const nowRef = useRef<HTMLDivElement>(null);
  const openedRef = useRef(false);
  useEffect(() => {
    if (openedRef.current || !entries || offset !== 0 || selected !== 0) return;
    openedRef.current = true;
    if (isTv) {
      if (nextUp?.kind === "episode") setTimeout(() => setFocus(rowKey(nextUp.entry)));
      return;
    }
    const node = nowRef.current;
    if (node && node.getBoundingClientRect().top > window.innerHeight * 0.75) node.scrollIntoView({ block: "center" });
  }, [entries, offset, selected, isTv, nextUp]);

  const endOfToday = new Date(new Date(today).setDate(new Date(today).getDate() + 1)).getTime();
  const play = (animeId: number, episode: number) => router.push(`/watch/${animeId}/${episode}`);
  const listCount = (day: Date) =>
    shown.filter((e) => startOfDay(new Date(e.airingAt * 1000)) === day.getTime() && isActive(mine.get(e.anime.id)));

  const agendaList =
    week === "failed" ? (
      <p className="text-lg text-zinc-400 tv:text-2xl">No se pudo cargar el calendario.</p>
    ) : !entries ? (
      <p className="text-lg text-zinc-500 tv:text-2xl">Cargando…</p>
    ) : agenda.length === 0 ? (
      <p className="px-5 py-8 rounded-2xl border-[1.5px] border-dashed border-line text-center text-zinc-400 tv:text-2xl">
        {view.onlyMine ? "Ninguna serie de tu lista sale este día." : "No hay episodios este día."}
      </p>
    ) : (
      <FocusGroup className="flex flex-col">
        {agenda.map((item, index) => (
          <div key={item.kind === "episode" ? rowKey(item.entry) : `rest:${item.rest.anime.id}`}>
            {index === nowIndex && <NowLine ref={nowRef} now={now} />}
            {item.kind === "episode" ? (
              <EpisodeRow
                entry={item.entry}
                mine={mine.get(item.entry.anime.id)}
                state={episodeState(item.entry, mine.get(item.entry.anime.id), now, endOfToday)}
                onPlay={play}
              />
            ) : (
              <RestRow rest={item.rest} mine={mine.get(item.rest.anime.id)} />
            )}
          </div>
        ))}
        {isToday && nowIndex === -1 && <NowLine ref={nowRef} now={now} />}
      </FocusGroup>
    );

  return (
    <PageFrame title="Calendario" ready={mounted}>
      {mounted && (
        <>
          <div className="flex flex-wrap items-center justify-between mb-4 tv:mb-6">
            <WeekNav offset={offset} range={weekRange(days)} onChange={changeWeek} />
            <ViewFilter />
          </div>

          <FocusGroup className="flex overflow-x-auto -mx-4 px-4 pb-2 mb-4 md:grid md:grid-cols-7 md:overflow-visible md:mx-0 md:px-0 tv:grid tv:grid-cols-7 tv:mb-8 tv-no-scrollbar">
            {days.map((day, index) => (
              <DayChip
                key={day.getTime()}
                name={dayName(day, today)}
                detail={`${Math.abs(startOfDay(day) - today) <= 86_400_000 ? `${weekdayShort(day)} ${day.getDate()} · ` : ""}${
                  shown.filter((e) => startOfDay(new Date(e.airingAt * 1000)) === day.getTime()).length
                } ep`}
                listed={listCount(day).map((e) => mine.get(e.anime.id)!.status!)}
                isToday={day.getTime() === today}
                active={index === selected}
                onSelect={() => setSelected(index)}
              />
            ))}
          </FocusGroup>

          <div className="lg:flex lg:items-start">
            <div className="flex-1 min-w-0">
              <WeekLine summary={summary} offset={offset} />
              {agendaList}
            </div>
            {!isTv && (
              <SidePanel summary={summary} offset={offset} catchUp={catchUp} rests={rests} mine={mine} onPlay={play} />
            )}
          </div>
        </>
      )}
    </PageFrame>
  );
}

const rowKey = (entry: ScheduleEntry) => `schedule:${entry.anime.id}:${entry.episode}`;

function WeekNav({ offset, range, onChange }: { offset: number; range: string; onChange: (step: number) => void }) {
  const arrow = (step: number) => {
    const hidden = Math.abs(offset + step) > MAX_WEEKS_AWAY;
    const label = step < 0 ? "Semana anterior" : "Semana siguiente";
    const Icon = step < 0 ? ChevronLeft : ChevronRight;
    if (hidden) return <span className="w-11 sm:w-32 tv:hidden" aria-hidden />;
    return (
      <FocusButton variant="secondary" className="!px-3 sm:!px-4" onSelect={() => onChange(step)}>
        {step < 0 && <Icon className="w-5 h-5 tv:w-6 tv:h-6" aria-hidden />}
        <span className="sr-only sm:not-sr-only sm:mx-1 tv:not-sr-only tv:mx-2">{label}</span>
        {step > 0 && <Icon className="w-5 h-5 tv:w-6 tv:h-6" aria-hidden />}
      </FocusButton>
    );
  };
  return (
    <FocusGroup className="flex items-center mr-4 mb-3">
      {arrow(-1)}
      <div className="flex flex-col items-center mx-3 min-w-[8.5rem] tv:mx-6 tv:min-w-[12rem]">
        <span className="text-[0.95rem] font-black tabular-nums tv:text-2xl">{range}</span>
        <span
          className={cn(
            "mt-0.5 text-[0.7rem] font-black uppercase tracking-[0.14em] tv:text-sm",
            offset === 0 ? "text-red-500" : "text-zinc-400"
          )}
        >
          {weekName(offset)}
        </span>
      </div>
      {arrow(1)}
    </FocusGroup>
  );
}

function ViewFilter() {
  const view = useScheduleView();
  return (
    <FocusGroup className="flex flex-wrap items-center mb-3">
      <span className="inline-flex p-[3px] mr-3 rounded-full bg-ink border-[1.5px] border-line">
        <FocusButton variant="segment" active={!view.onlyMine} onSelect={() => updateScheduleView({ onlyMine: false })}>
          Todas
        </FocusButton>
        <FocusButton variant="segment" active={view.onlyMine} onSelect={() => updateScheduleView({ onlyMine: true })}>
          Mi lista
        </FocusButton>
      </span>
      {view.onlyMine && (
        <>
          <FocusButton variant="chip" className="mr-2" active={view.watching} onSelect={() => updateScheduleView({ watching: !view.watching })}>
            Viendo
          </FocusButton>
          <FocusButton variant="chip" active={view.planning} onSelect={() => updateScheduleView({ planning: !view.planning })}>
            Pendientes
          </FocusButton>
        </>
      )}
    </FocusGroup>
  );
}

function DayChip({
  name,
  detail,
  listed,
  isToday,
  active,
  onSelect,
}: {
  name: string;
  detail: string;
  listed: NonNullable<MyEntry["status"]>[];
  isToday: boolean;
  active: boolean;
  onSelect: () => void;
}) {
  const isTv = useIsTv();
  const { ref, focused, pointerProps } = useTvFocusable({ onSelect });
  const face = (lit: boolean) => (
    <>
      <span className={cn("text-[0.95rem] font-black whitespace-nowrap tv:text-xl", isToday && !lit && "text-red-500")}>{name}</span>
      <span className={cn("mt-0.5 text-xs tabular-nums whitespace-nowrap tv:text-base", lit ? "text-zinc-600" : "text-zinc-400")}>{detail}</span>
      <span className="flex mt-1.5 h-[7px]" aria-hidden>
        {listed.slice(0, 6).map((status, i) => (
          <span key={i} className={cn("w-[7px] h-[7px] mr-1 rounded-full", STATUS_STYLES[status].dot)} />
        ))}
      </span>
    </>
  );
  const base = "flex flex-col items-start flex-shrink-0 min-w-[6.25rem] mr-2 last:mr-0 px-3 py-2.5 rounded-xl border-[1.5px] text-left md:min-w-0";

  if (!isTv) {
    return (
      <button
        type="button"
        onClick={onSelect}
        aria-pressed={active}
        className={cn(
          base,
          "outline-none transition-colors focus-visible:koma-sm",
          active ? "bg-white border-white text-black shadow-hard-accent" : "bg-ink border-line hover:border-zinc-500"
        )}
      >
        {face(active)}
      </button>
    );
  }
  const lit = focused || active;
  return (
    <div
      ref={ref}
      {...pointerProps}
      className={cn(
        base,
        "min-w-0 px-4 py-3 cursor-pointer outline-none transition-transform duration-150",
        focused ? "bg-white border-white text-black koma" : active ? "bg-white border-white text-black" : "bg-ink border-line"
      )}
    >
      {face(lit)}
    </div>
  );
}

const NowLine = forwardRef<HTMLDivElement, { now: number }>(function NowLine({ now }, ref) {
  return (
  <div ref={ref} className="flex items-center my-2 text-xs font-black uppercase tracking-[0.1em] text-red-500 tabular-nums tv:text-base tv:my-3">
    <span className="w-2.5 h-2.5 mr-2.5 rounded-full bg-red-500" />
    Ahora · {formatTime(Math.floor(now / 1000))}
    <span className="flex-1 h-0.5 ml-2.5 bg-red-500" />
  </div>
  );
});

function Cover({ anime, status, dim }: { anime: CatalogItem; status: MyEntry["status"] | undefined; dim?: boolean }) {
  return (
    <span
      className={cn(
        "relative w-11 h-[3.75rem] sm:w-12 sm:h-[4.25rem] flex-shrink-0 rounded-lg overflow-hidden bg-ink-2 tv:w-14 tv:h-20",
        dim && "grayscale opacity-50"
      )}
    >
      {anime.cover && (
        <img src={anime.cover} alt="" loading="lazy" decoding="async" className="absolute inset-0 w-full h-full object-cover" />
      )}
      {status && (
        <span
          className={cn(
            "absolute left-1 right-1 top-1 rounded py-[1px] text-center text-[0.5rem] font-black uppercase leading-tight tracking-wide tv:text-[0.6rem]",
            STATUS_STYLES[status].badge
          )}
        >
          {REMOTE_STATUS_LABELS[status]}
        </span>
      )}
    </span>
  );
}

function StateLine({ state, lit }: { state: EpisodeState; lit: boolean }) {
  const icon = "w-4 h-4 mr-1.5 flex-shrink-0 tv:w-5 tv:h-5";
  const tone = (color: string) => (lit ? "text-zinc-700" : color);
  const countdown = (minutes: number | null) =>
    minutes !== null && (
      <span className={cn("inline-flex items-center mr-3", tone("text-white"))}>
        <Clock className={icon} />
        {countdownLabel(minutes)}
      </span>
    );

  let body: React.ReactNode = null;
  switch (state.kind) {
    case "seen":
      body = (
        <span className={cn("inline-flex items-center", lit ? "text-emerald-700" : "text-emerald-400")}>
          <Check className={icon} />
          Visto
        </span>
      );
      break;
    case "fresh":
      body = (
        <span className={cn("inline-flex items-center", tone("text-amber-400"))}>
          <Clock className={icon} />
          Emitido hace {state.minutesAgo} min · disponible en breve
        </span>
      );
      break;
    case "available":
      body = <span className={tone("text-white")}>Disponible</span>;
      break;
    case "behind":
      body = (
        <>
          {countdown(state.minutesLeft)}
          {state.started ? (
            <span className={cn("inline-flex items-center", lit ? "text-red-700" : "text-red-400")}>
              <ChevronsLeft className={icon} />
              {state.missing === 1 ? "Te falta 1" : `Te faltan ${state.missing}`}
            </span>
          ) : (
            <span className={tone("text-zinc-300")}>
              {state.missing === 1 ? "1 ya emitido" : `${state.missing} ya emitidos`}
            </span>
          )}
        </>
      );
      break;
    case "upcoming":
      body = countdown(state.minutesLeft);
      break;
  }
  if (!body) return null;
  return <span className="flex flex-wrap items-center mt-1 text-[0.8rem] font-bold tv:text-lg">{body}</span>;
}

/**
 * The episode to open from a row, and how its button reads. Only your shows get the solid
 * button: a day has dozens of episodes out, and the rest would drown them.
 */
function rowAction(state: EpisodeState, mine: MyEntry | undefined) {
  if (state.kind === "available") return { episode: state.play, label: `Ver EP ${state.play}`, primary: isActive(mine) };
  if (state.kind === "behind")
    return { episode: state.play, label: `${state.started ? "Seguir por" : "Empezar por"} EP ${state.play}`, primary: false };
  return null;
}

function Tags({ entry, lit }: { entry: ScheduleEntry; lit: boolean }) {
  const tag = "ml-2 px-1.5 py-[1px] rounded text-[0.65rem] font-black tracking-[0.12em] tv:text-xs";
  return (
    <>
      {isPremiere(entry) && <span className={cn(tag, lit ? "bg-black text-white" : "bg-red-500 text-black")}>ESTRENO</span>}
      {isFinale(entry) && <span className={cn(tag, lit ? "bg-black text-amber-400" : "bg-amber-400 text-black")}>FINAL</span>}
    </>
  );
}

function EpisodeRow({
  entry,
  mine,
  state,
  onPlay,
}: {
  entry: ScheduleEntry;
  mine: MyEntry | undefined;
  state: EpisodeState;
  onPlay: (animeId: number, episode: number) => void;
}) {
  const isTv = useIsTv();
  const router = useRouter();
  const reveal = useRevealOnFocus(120);
  const action = rowAction(state, mine);
  const { anime } = entry;
  const openAnime = () => router.push(`/anime/${anime.id}`);
  // On the TV OK plays when there's something to play, and opens the anime otherwise
  const { ref, focused, pointerProps } = useTvFocusable({
    focusKey: rowKey(entry),
    onSelect: action ? () => onPlay(anime.id, action.episode) : openAnime,
    onFocus: (layout, _props, details) => reveal(layout.node, details),
  });
  const time = formatTime(entry.airingAt);
  const lit = isTv && focused;

  const body = (
    <>
      <span className="hidden sm:block w-16 flex-shrink-0 text-lg font-black tabular-nums tv:block tv:w-24 tv:text-2xl">{time}</span>
      <Cover anime={anime} status={mine?.status} />
      <span className="flex flex-col min-w-0 ml-3 sm:ml-4 tv:ml-5">
        <span className="text-[0.95rem] font-black leading-snug truncate tv:text-2xl">{anime.title}</span>
        <span className={cn("flex flex-wrap items-center mt-0.5 text-[0.8rem] tabular-nums tv:text-lg", lit ? "text-zinc-600" : "text-zinc-400")}>
          <span className="sm:hidden tv:hidden font-black text-white mr-1.5">{time} ·</span>
          EP {entry.episode}
          {anime.episodes ? ` de ${anime.episodes}` : ""}
          <Tags entry={entry} lit={lit} />
        </span>
        <StateLine state={state} lit={lit} />
      </span>
    </>
  );

  if (isTv) {
    return (
      <div
        ref={ref}
        {...pointerProps}
        className={cn(
          "flex items-center mb-3 px-5 py-3 rounded-2xl border-[1.5px] cursor-pointer outline-none transition-transform duration-150",
          focused ? "bg-white border-white text-black koma" : "bg-ink-3 border-transparent",
          state.kind === "seen" && !focused && "opacity-60"
        )}
      >
        <span className="flex items-center flex-1 min-w-0">{body}</span>
        {action && (
          <span
            className={cn(
              "inline-flex items-center flex-shrink-0 ml-4 h-12 px-5 rounded-full text-lg font-black",
              focused ? "bg-black text-white" : action.primary ? "bg-red-500 text-black" : "border-[1.5px] border-white"
            )}
          >
            <Play className="w-5 h-5 mr-2" fill="currentColor" />
            {action.label}
          </span>
        )}
      </div>
    );
  }

  return (
    <div
      className={cn(
        "flex items-center mb-2 p-2.5 sm:p-3 rounded-2xl bg-ink-3 border-[1.5px] border-transparent",
        state.kind === "seen" && "opacity-60"
      )}
    >
      <Link href={`/anime/${anime.id}`} className="flex items-center flex-1 min-w-0 rounded-xl outline-none focus-visible:koma-sm">
        {body}
      </Link>
      {action && (
        <button
          type="button"
          onClick={() => onPlay(anime.id, action.episode)}
          aria-label={action.label}
          className={cn(
            "inline-flex items-center justify-center flex-shrink-0 ml-3 w-10 h-10 sm:w-auto sm:px-4 rounded-full text-sm font-black whitespace-nowrap outline-none focus-visible:koma-sm",
            action.primary ? "bg-red-500 text-black shadow-hard hover:bg-red-400" : "border-[1.5px] border-white hover:bg-white hover:text-black"
          )}
        >
          <Play className="w-4 h-4 sm:mr-2" fill="currentColor" />
          <span className="hidden sm:inline">{action.label}</span>
        </button>
      )}
    </div>
  );
}

/** A show on your list that skips this week, in its usual slot */
function RestRow({ rest, mine }: { rest: RestSlot; mine: MyEntry | undefined }) {
  const isTv = useIsTv();
  const router = useRouter();
  const reveal = useRevealOnFocus(120);
  const { ref, focused, pointerProps } = useTvFocusable({
    onSelect: () => router.push(`/anime/${rest.anime.id}`),
    onFocus: (layout, _props, details) => reveal(layout.node, details),
  });
  const time = formatTime(Math.floor(rest.slot / 1000));
  const body = (
    <>
      <span className="hidden sm:block w-16 flex-shrink-0 text-lg font-black tabular-nums text-zinc-500 tv:block tv:w-24 tv:text-2xl">{time}</span>
      <Cover anime={rest.anime} status={mine?.status} dim />
      <span className="flex flex-col min-w-0 ml-3 sm:ml-4 tv:ml-5">
        <span className="text-[0.95rem] font-black leading-snug truncate tv:text-2xl">{rest.anime.title}</span>
        <span className={cn("flex items-start mt-1 text-[0.8rem] font-bold tv:text-lg", isTv && focused ? "text-zinc-700" : "text-zinc-400")}>
          <Pause className="w-4 h-4 mr-1.5 mt-[1px] flex-shrink-0 tv:w-5 tv:h-5" />
          <span>Descansa esta semana · {returnLabel(rest)}</span>
        </span>
      </span>
    </>
  );
  const frame = "flex items-center mb-2 p-2.5 sm:p-3 rounded-2xl border-[1.5px] border-dashed";
  if (isTv) {
    return (
      <div
        ref={ref}
        {...pointerProps}
        className={cn(
          frame,
          "mb-3 px-5 py-3 cursor-pointer outline-none transition-transform duration-150",
          focused ? "bg-white border-white border-solid text-black koma" : "border-line"
        )}
      >
        {body}
      </div>
    );
  }
  return (
    <Link href={`/anime/${rest.anime.id}`} className={cn(frame, "border-line outline-none hover:border-zinc-500 focus-visible:koma-sm")}>
      {body}
    </Link>
  );
}

/** One line on the week, above the agenda: on phones and the TV, which have no side panel */
function WeekLine({ summary, offset }: { summary: WeekSummary; offset: number }) {
  if (summary.mine === 0) return null;
  const when = offset === 0 ? "estos 7 días" : offset < 0 ? "la semana pasada" : "la semana que viene";
  return (
    <p className="mb-3 text-sm text-zinc-400 lg:hidden tv:block tv:mb-5 tv:text-xl">
      <b className="text-white">{summary.mine}</b> {summary.mine === 1 ? "episodio" : "episodios"} de tu lista {when}
      {summary.unseen > 0 && (
        <>
          {" · "}
          <b className="text-white">{summary.unseen}</b> sin ver
        </>
      )}
    </p>
  );
}

function SidePanel({
  summary,
  offset,
  catchUp,
  rests,
  mine,
  onPlay,
}: {
  summary: WeekSummary;
  offset: number;
  catchUp: ReturnType<typeof catchUpList>;
  rests: RestSlot[];
  mine: Map<number, MyEntry>;
  onPlay: (animeId: number, episode: number) => void;
}) {
  const box = "p-4 mb-4 rounded-2xl bg-ink border-[1.5px] border-line";
  const title = "mb-3 font-display text-[0.95rem]";
  const stat = (value: number, label: string) => (
    <div className="p-2.5 rounded-xl bg-ink-3">
      <b className="block font-display text-2xl leading-none tabular-nums">{value}</b>
      <span className="text-xs text-zinc-400">{label}</span>
    </div>
  );
  return (
    <aside className="hidden lg:block lg:w-[19rem] lg:flex-shrink-0 lg:ml-8">
      <div className={box}>
        <h2 className={title}>{offset === 0 ? "Tus próximos 7 días" : weekName(offset)}</h2>
        <div className="grid grid-cols-2 gap-2">
          {stat(summary.mine, "episodios de tu lista")}
          {stat(summary.unseen, "emitidos sin ver")}
          {stat(summary.premieres, summary.premieres === 1 ? "estreno" : "estrenos")}
          {stat(summary.finales, summary.finales === 1 ? "final" : "finales")}
        </div>
      </div>
      <div className={box}>
        <h2 className={title}>Ponte al día</h2>
        {catchUp.length === 0 ? (
          <p className="text-[0.85rem] leading-relaxed text-zinc-400">Vas al día con todo lo que estás viendo en emisión.</p>
        ) : (
          catchUp.slice(0, 6).map((c) => (
            <div key={c.anime.id} className="flex items-center mb-2.5 last:mb-0">
              <Link href={`/anime/${c.anime.id}`} className="flex items-center flex-1 min-w-0 rounded-lg outline-none focus-visible:koma-sm">
                <span className="relative w-8 h-11 flex-shrink-0 rounded-md overflow-hidden bg-ink-2">
                  {c.anime.cover && <img src={c.anime.cover} alt="" loading="lazy" className="absolute inset-0 w-full h-full object-cover" />}
                </span>
                <span className="flex flex-col min-w-0 ml-2.5">
                  <span className="text-[0.85rem] font-bold truncate">{c.anime.title}</span>
                  <span className="text-xs text-zinc-400">
                    {c.missing === 1 ? "Te falta 1" : `Te faltan ${c.missing}`} · vas por el {mine.get(c.anime.id)?.watched ?? 0}
                  </span>
                </span>
              </Link>
              <button
                type="button"
                onClick={() => onPlay(c.anime.id, c.next)}
                className="flex-shrink-0 ml-2 h-8 px-3 rounded-full border-[1.5px] border-white text-xs font-black hover:bg-white hover:text-black outline-none focus-visible:koma-sm"
              >
                EP {c.next}
              </button>
            </div>
          ))
        )}
      </div>
      {rests.length > 0 && (
        <div className={box}>
          <h2 className={title}>Descansan esta semana</h2>
          {rests.map((r) => (
            <Link
              key={r.anime.id}
              href={`/anime/${r.anime.id}`}
              className="flex items-center mb-2.5 last:mb-0 rounded-lg outline-none focus-visible:koma-sm"
            >
              <span className="relative w-8 h-11 flex-shrink-0 rounded-md overflow-hidden bg-ink-2 grayscale">
                {r.anime.cover && <img src={r.anime.cover} alt="" loading="lazy" className="absolute inset-0 w-full h-full object-cover" />}
              </span>
              <span className="flex flex-col min-w-0 ml-2.5">
                <span className="text-[0.85rem] font-bold truncate">{r.anime.title}</span>
                <span className="text-xs text-zinc-400">{capitalize(returnLabel(r))}</span>
              </span>
            </Link>
          ))}
        </div>
      )}
    </aside>
  );
}
