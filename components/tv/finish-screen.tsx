"use client";

import { useEffect, useState } from "react";
import { setFocus } from "@noriginmedia/norigin-spatial-navigation";
import type { CatalogItem } from "@/lib/anilist/types";
import { useEntryEditor, type EditTarget } from "@/lib/library/use-entry-editor";
import type { TrackerEntry } from "@/lib/trackers/types";
import { FocusButton, FocusGroup } from "./focusable";
import { useBackHandler } from "./navigation-provider";
import { useIsTv } from "@/components/ui-mode";
import { cn } from "@/lib/utils";

const SCORES = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

/**
 * Shown in place of the player after the last episode of a finished anime: asks for a score and
 * marks it completed on the list (the service's while signed in, this device's otherwise).
 * "Ahora no" leaves without changing anything; Back does the same.
 */
export function FinishScreen({
  anime,
  entry,
  target,
  listName,
  onDone,
  children,
}: {
  anime: CatalogItem;
  entry: TrackerEntry | null;
  target: EditTarget;
  listName: string;
  onDone: () => void;
  /** More choices under the score, such as the next season */
  children?: React.ReactNode;
}) {
  const isTv = useIsTv();
  const { saving, failed, update } = useEntryEditor(anime, target);
  const [picked, setPicked] = useState<number | null>(entry?.score ?? null);

  useBackHandler(() => {
    onDone();
    return true;
  });

  useEffect(() => {
    if (isTv) setFocus(`finish:score:${entry?.score || 8}`);
    // Only on open
  }, []);

  const rate = async (score: number) => {
    setPicked(score);
    if (await update({ status: "completed", score })) onDone();
  };

  const art = anime.banner || anime.cover;
  return (
    <div className="fixed top-0 left-0 z-50 w-screen h-screen bg-black text-white overflow-hidden screen-in">
      {art && (
        <img
          src={art}
          alt=""
          aria-hidden
          className="absolute top-0 left-0 w-full h-full object-cover opacity-30 blur-sm scale-105"
        />
      )}
      <div className="absolute top-0 left-0 w-full h-full bg-gradient-to-t from-black via-black/80 to-black/40" />
      <div
        className={cn(
          "relative flex flex-col justify-center h-full max-w-[80rem]",
          isTv ? "pl-[7rem] pr-12" : "px-5 md:px-12"
        )}
      >
        <p className={cn("font-bold uppercase tracking-[0.2em] text-red-500", isTv ? "text-xl" : "text-sm")}>
          Serie terminada
        </p>
        <h1 className={cn("mt-3 font-black leading-tight line-clamp-2", isTv ? "text-6xl" : "text-3xl md:text-5xl")}>
          {anime.title}
        </h1>
        <p className={cn("mt-6 text-zinc-300", isTv ? "text-3xl" : "text-lg md:text-xl")}>¿Qué nota le das?</p>
        <p className={cn("mt-1 text-zinc-500", isTv ? "text-xl" : "text-sm")}>
          Se marca como completado en {listName}
        </p>

        <FocusGroup className="flex flex-wrap mt-6" preferredChildFocusKey={`finish:score:${picked || 8}`}>
          {SCORES.map((score) => (
            <FocusButton
              key={score}
              focusKey={`finish:score:${score}`}
              variant="chip"
              active={picked === score}
              className={cn("mb-3", isTv ? "mr-3 min-w-[4.5rem]" : "mr-2 min-w-[3rem]")}
              onSelect={() => rate(score)}
            >
              {score}
            </FocusButton>
          ))}
        </FocusGroup>

        <FocusGroup className="flex flex-wrap items-center mt-4">
          {children}
          <FocusButton variant="secondary" className="mr-4 mb-3" onSelect={onDone}>
            Ahora no
          </FocusButton>
          <span className={cn("mb-3 text-zinc-400", isTv ? "text-xl" : "text-sm")}>
            {saving ? "Guardando…" : failed ? `No se pudo guardar en ${listName}` : ""}
          </span>
        </FocusGroup>
      </div>
    </div>
  );
}
