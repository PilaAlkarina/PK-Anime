"use client";

import { useEffect, useState } from "react";
import { setFocus } from "@noriginmedia/norigin-spatial-navigation";
import { Minus, Plus } from "lucide-react";
import type { CatalogItem } from "@/lib/anilist/types";
import { REMOTE_STATUS_LABELS } from "@/lib/library/remote";
import { progressChanges, useEntryEditor, type EditTarget } from "@/lib/library/use-entry-editor";
import type { ListStatus, TrackerEntry } from "@/lib/trackers/types";
import { FocusButton, FocusGroup } from "./focusable";
import { StatusDot } from "./list-styles";
import { useBackHandler } from "./navigation-provider";

const STATUSES = Object.keys(REMOTE_STATUS_LABELS) as ListStatus[];
const SCORES = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

/**
 * Status and score of one anime on the remote list, edited in place on the anime page. Each
 * choice is saved as soon as it's picked; Back (or "Listo") closes the panel.
 */
export function ListEntryPanel({
  anime,
  entry,
  target,
  providerName,
  onClose,
  onReveal,
}: {
  anime: CatalogItem;
  entry: TrackerEntry;
  target: EditTarget;
  /** The list's name: the service's, or "Mi lista" for this device's */
  providerName: string;
  onClose: () => void;
  /** Scrolls a row of the panel into view as focus reaches it */
  onReveal?: (node: HTMLElement) => void;
}) {
  const { saving, failed, update, remove } = useEntryEditor(anime, target);
  // Episodes out so far, for anime still airing
  const total = anime.availableEpisodes ?? anime.episodes;
  const setProgress = (progress: number) => update(progressChanges(anime, entry, progress));

  useBackHandler(() => {
    onClose();
    return true;
  });

  useEffect(() => {
    setFocus(`entry:status:${entry.status}`);
    // Only on open; later changes keep focus where the viewer is
  }, []);

  // Removing asks for a second press, since it also drops the score and progress
  const [confirming, setConfirming] = useState(false);
  const removeAndClose = async () => {
    if (!confirming) return setConfirming(true);
    if (await remove()) onClose();
  };

  return (
    <div className="mt-6 p-6 rounded-2xl bg-zinc-900/95 border-2 border-zinc-800">
      <p className="text-lg text-zinc-400">Estado en {providerName}</p>
      {/* Focus enters each row on the current choice, so OK on arrival changes nothing */}
      <FocusGroup
        className="flex flex-wrap mt-3"
        onFocusInside={onReveal}
        preferredChildFocusKey={`entry:status:${entry.status}`}
      >
        {STATUSES.map((status) => (
          <FocusButton
            key={status}
            focusKey={`entry:status:${status}`}
            variant="chip"
            className="mr-3 mb-3"
            active={entry.status === status}
            onSelect={() => status !== entry.status && update({ status })}
          >
            <StatusDot status={status} className="w-3 h-3 mr-2.5" />
            {REMOTE_STATUS_LABELS[status]}
          </FocusButton>
        ))}
      </FocusGroup>

      <p className="mt-3 text-lg text-zinc-400">Puntuación</p>
      <FocusGroup
        className="flex flex-wrap mt-3"
        onFocusInside={onReveal}
        preferredChildFocusKey={`entry:score:${entry.score ?? 0}`}
      >
        {SCORES.map((score) => (
          <FocusButton
            key={score}
            focusKey={`entry:score:${score}`}
            variant="chip"
            className="mr-3 mb-3"
            active={(entry.score ?? 0) === score}
            onSelect={() => score !== (entry.score ?? 0) && update({ score: score || null })}
          >
            {score ? score : "Sin nota"}
          </FocusButton>
        ))}
      </FocusGroup>

      <p className="mt-3 text-lg text-zinc-400">Episodios vistos</p>
      <FocusGroup
        className="flex flex-wrap items-center mt-3"
        onFocusInside={onReveal}
        preferredChildFocusKey="entry:progress:more"
      >
        <FocusButton
          variant="chip"
          focusKey="entry:progress:less"
          className="mr-3 mb-3 min-w-[3.5rem]"
          onSelect={() => entry.progress > 0 && setProgress(entry.progress - 1)}
          aria-label="Un episodio visto menos"
        >
          <Minus aria-hidden className="w-6 h-6" />
        </FocusButton>
        <span className="mr-3 mb-3 min-w-[7rem] text-center text-xl font-bold">
          {entry.progress}
          {total ? ` de ${total}` : ""}
        </span>
        <FocusButton
          variant="chip"
          focusKey="entry:progress:more"
          className="mr-3 mb-3 min-w-[3.5rem]"
          onSelect={() => (!total || entry.progress < total) && setProgress(entry.progress + 1)}
          aria-label="Un episodio visto más"
        >
          <Plus aria-hidden className="w-6 h-6" />
        </FocusButton>
        {!!total && entry.progress < total && (
          <FocusButton variant="chip" className="mr-3 mb-3" onSelect={() => setProgress(total)}>
            Todos vistos
          </FocusButton>
        )}
      </FocusGroup>

      <FocusGroup className="flex items-center mt-4" onFocusInside={onReveal}>
        <FocusButton variant="secondary" className="mr-4" onSelect={onClose}>
          Listo
        </FocusButton>
        <FocusButton variant="secondary" onSelect={removeAndClose}>
          {confirming ? "Pulsa otra vez para quitarlo" : `Quitar de ${providerName}`}
        </FocusButton>
        <span className="ml-6 text-lg text-zinc-400">
          {saving ? "Guardando…" : failed ? `No se pudo guardar en ${providerName}` : ""}
        </span>
      </FocusGroup>
    </div>
  );
}
