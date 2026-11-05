"use client";

import { useState } from "react";
import type { CatalogItem } from "@/lib/anilist/types";
import { ScorePill, StatusDot } from "@/components/tv/list-styles";
import { REMOTE_STATUS_LABELS } from "@/lib/library/remote";
import { progressChanges, useEntryEditor, type EditTarget } from "@/lib/library/use-entry-editor";
import type { ListStatus, TrackerEntry } from "@/lib/trackers/types";
import { Select, type SelectOption } from "./select";

const STATUSES = Object.keys(REMOTE_STATUS_LABELS) as ListStatus[];
const SCORES = [10, 9, 8, 7, 6, 5, 4, 3, 2, 1];

const STATUS_OPTIONS: SelectOption<ListStatus>[] = STATUSES.map((status) => ({
  value: status,
  text: REMOTE_STATUS_LABELS[status],
  label: (
    <>
      <StatusDot status={status} className="w-2.5 h-2.5 mr-2" />
      {REMOTE_STATUS_LABELS[status]}
    </>
  ),
}));

const SCORE_OPTIONS: SelectOption<number>[] = [
  { value: 0, label: "Sin nota" },
  ...SCORES.map((score) => ({ value: score, text: String(score), label: `★ ${score}` })),
];

/** Status and score of one anime on the list (the service's or this device's), saved as soon as they change */
export function ListEntryControls({
  anime,
  entry,
  target,
  providerName,
}: {
  anime: CatalogItem;
  entry: TrackerEntry;
  target: EditTarget;
  /** The list's name: the service's, or "Mi lista" for this device's */
  providerName: string;
}) {
  const { saving, failed, update, remove } = useEntryEditor(anime, target);
  const [confirming, setConfirming] = useState(false);
  // Episodes out so far, for anime still airing
  const total = anime.availableEpisodes ?? anime.episodes;
  const setProgress = (progress: number) => update(progressChanges(anime, entry, progress));
  const stepClass =
    "flex items-center justify-center w-9 h-10 text-lg text-white hover:bg-zinc-800 disabled:opacity-40 disabled:hover:bg-transparent";

  return (
    <div className="flex flex-wrap items-center gap-2 text-sm text-zinc-400">
      <span className="flex items-center w-full sm:w-auto">
        <StatusDot status={entry.status} className="w-2.5 h-2.5 mr-2" />
        En {providerName}
        {entry.score ? <ScorePill score={entry.score} inline className="ml-2 px-1.5 py-1 text-xs" /> : null}
      </span>
      <Select<ListStatus>
        ariaLabel={`Estado en ${providerName}`}
        value={entry.status}
        options={STATUS_OPTIONS}
        disabled={saving}
        onChange={(status) => update({ status })}
      />
      <Select<number>
        ariaLabel="Puntuación"
        value={entry.score ?? 0}
        options={SCORE_OPTIONS}
        disabled={saving}
        onChange={(score) => update({ score: score || null })}
        buttonClassName="min-w-[7rem]"
      />
      <span className="flex items-center h-10 rounded-lg border-[1.5px] border-line bg-ink-3 overflow-hidden" role="group" aria-label="Episodios vistos">
        <button
          type="button"
          className={stepClass}
          disabled={saving || entry.progress <= 0}
          onClick={() => setProgress(entry.progress - 1)}
          aria-label="Un episodio visto menos"
        >
          −
        </button>
        <span className="px-2 min-w-[4.5rem] text-center text-white tabular-nums">
          {entry.progress}
          {total ? `/${total}` : ""} vistos
        </span>
        <button
          type="button"
          className={stepClass}
          disabled={saving || (!!total && entry.progress >= total)}
          onClick={() => setProgress(entry.progress + 1)}
          aria-label="Un episodio visto más"
        >
          +
        </button>
      </span>
      {!!total && entry.progress < total && (
        <button
          type="button"
          disabled={saving}
          onClick={() => setProgress(total)}
          className="h-10 px-3 rounded-lg text-zinc-300 hover:text-white hover:bg-zinc-800 disabled:opacity-60"
        >
          Todos vistos
        </button>
      )}
      <button
        type="button"
        disabled={saving}
        onClick={() => (confirming ? remove() : setConfirming(true))}
        onBlur={() => setConfirming(false)}
        className="h-10 px-3 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 disabled:opacity-60"
      >
        {confirming ? "¿Quitar? Pulsa otra vez" : `Quitar de ${providerName}`}
      </button>
      {(saving || failed) && (
        <span role="status">{saving ? "Guardando…" : `No se pudo guardar en ${providerName}`}</span>
      )}
    </div>
  );
}
