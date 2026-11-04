"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { JapaneseLabel } from "@/components/brand";
import type { ScheduleEntry } from "@/lib/anilist/types";
import { cn } from "@/lib/utils";

const MAX_ITEMS = 9;
/** An episode stays "on air" for a while after its start time */
const AIRED_AFTER_MS = 30 * 60 * 1000;

const formatTime = (seconds: number) =>
  new Date(seconds * 1000).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });

/**
 * Today's episodes in the viewer's local day, from the next one to air. Fetched in the browser
 * because "today" depends on the viewer's time zone.
 */
export function TodayAiring({ className }: { className?: string }) {
  const [entries, setEntries] = useState<ScheduleEntry[] | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    const from = Math.floor(start.getTime() / 1000);
    const to = Math.floor(end.getTime() / 1000);

    const ctrl = new AbortController();
    fetch(`/api/catalog/schedule?from=${from}&to=${to}`, { signal: ctrl.signal })
      .then((res) => res.json())
      .then((data) => {
        if (!data.success) throw new Error(data.error);
        // The API snaps its range outward, so keep only today's
        const today = (data.entries as ScheduleEntry[])
          .filter((e) => e.airingAt >= from && e.airingAt < to)
          .sort((a, b) => a.airingAt - b.airingAt);
        setEntries(today);
      })
      .catch(() => setEntries([]));

    // Keeps "already aired" up to date while the page stays open
    const timer = setInterval(() => setNow(Date.now()), 60_000);
    return () => {
      ctrl.abort();
      clearInterval(timer);
    };
  }, []);

  if (!entries || entries.length === 0) return null;

  // From the next episode to air, but always a full list when the day is nearly over
  const firstUpcoming = entries.findIndex((e) => e.airingAt * 1000 + AIRED_AFTER_MS > now);
  const start = Math.max(0, Math.min(firstUpcoming === -1 ? entries.length : firstUpcoming, entries.length - MAX_ITEMS));
  const shown = entries.slice(start, start + MAX_ITEMS);

  return (
    <section className={cn("px-4 md:px-8", className)}>
      <div className="flex items-baseline justify-between gap-4 mb-4">
        <h2 className="text-lg md:text-[1.35rem] font-bold">
          Hoy en emisión
          <JapaneseLabel title="Hoy en emisión" />
        </h2>
        <Link href="/schedule" className="text-sm font-bold hover:text-red-500 focus-visible:text-red-500 outline-none">
          Calendario completo
        </Link>
      </div>
      <ul className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {shown.map((entry) => {
          const aired = entry.airingAt * 1000 + AIRED_AFTER_MS <= now;
          return (
            <li key={`${entry.anime.id}-${entry.episode}`}>
              <Link
                href={`/anime/${entry.anime.id}`}
                className="flex items-center gap-3.5 p-3 rounded-xl bg-zinc-900 border-[1.5px] border-line outline-none transition duration-200 hover:koma-sm focus-visible:koma-sm"
              >
                <span
                  className={cn(
                    "w-[3.25rem] shrink-0 text-[15px] font-black tabular-nums",
                    aired ? "text-zinc-400" : "text-red-500"
                  )}
                >
                  {formatTime(entry.airingAt)}
                </span>
                <span className="relative w-10 h-14 shrink-0 rounded-md overflow-hidden bg-ink-3">
                  {entry.anime.cover && (
                    <img src={entry.anime.cover} alt="" loading="lazy" decoding="async" className="absolute inset-0 w-full h-full object-cover" />
                  )}
                </span>
                <span className="flex flex-col gap-0.5 min-w-0">
                  <span className="text-[15px] font-bold truncate">{entry.anime.title}</span>
                  <span className="text-[13px] font-medium text-zinc-400">
                    Episodio {entry.episode}
                    {aired && " · ya emitido"}
                  </span>
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
