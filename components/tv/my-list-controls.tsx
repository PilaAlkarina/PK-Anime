"use client";

import { useIsTv } from "@/components/ui-mode";
import {
  LIST_SORTS,
  type ListSort,
  type ListView,
  type ScoreFilter,
  type StatusFilter,
} from "@/lib/library/list-view";
import { REMOTE_STATUS_LABELS } from "@/lib/library/remote";
import { FocusButton, FocusGroup } from "./focusable";
import { StatusDot } from "./list-styles";
import { useRevealOnFocus } from "./page-frame";

interface MyListControlsProps {
  statuses: { value: StatusFilter; count: number }[];
  formats: { value: string; label: string; count: number }[];
  scores: { value: ScoreFilter; label: string }[];
  view: ListView;
  onChange: (changes: Partial<ListView>) => void;
}

const statusLabel = (value: StatusFilter) =>
  value === "all" ? "Todo" : value === "local" ? "Solo en este dispositivo" : REMOTE_STATUS_LABELS[value];

/** Status chips, then sort, score and format: chips on TV, selects on the web */
export function MyListControls(props: MyListControlsProps) {
  const isTv = useIsTv();
  const { statuses, view, onChange } = props;

  return (
    <div className="mb-6 tv:mb-8">
      {statuses.length > 1 && (
        <StatusChips statuses={statuses} active={view.status} onSelect={(status) => onChange({ status })} />
      )}
      {isTv ? <TvOptions {...props} /> : <WebOptions {...props} />}
    </div>
  );
}

function StatusChips({
  statuses,
  active,
  onSelect,
}: {
  statuses: MyListControlsProps["statuses"];
  active: StatusFilter;
  onSelect: (status: StatusFilter) => void;
}) {
  const reveal = useRevealOnFocus();
  return (
    <FocusGroup className="flex flex-wrap" onFocusInside={(node) => reveal(node)}>
      {statuses.map(({ value, count }) => (
        <FocusButton
          key={value}
          variant="chip"
          className="mr-2 mb-2 tv:mr-3 tv:mb-3"
          active={value === active}
          onSelect={() => onSelect(value)}
        >
          {value !== "all" && <StatusDot status={value} className="w-2.5 h-2.5 mr-2 tv:w-3 tv:h-3 tv:mr-2.5" />}
          {statusLabel(value)} · {count}
        </FocusButton>
      ))}
    </FocusGroup>
  );
}

function OptionLabel({ children, className }: { children: React.ReactNode; className?: string }) {
  return <span className={`mr-4 mb-3 text-lg text-zinc-400 ${className ?? ""}`}>{children}</span>;
}

function TvOptions({ formats, scores, view, onChange }: MyListControlsProps) {
  const reveal = useRevealOnFocus();
  return (
    <>
      <FocusGroup className="flex flex-wrap items-center mt-2" onFocusInside={(node) => reveal(node)}>
        <OptionLabel>Ordenar por</OptionLabel>
        {LIST_SORTS.map(({ value, label }) => (
          <FocusButton
            key={value}
            variant="chip"
            className="mr-3 mb-3"
            active={value === view.sort}
            onSelect={() => onChange({ sort: value })}
          >
            {label}
          </FocusButton>
        ))}
      </FocusGroup>
      <FocusGroup className="flex flex-wrap items-center" onFocusInside={(node) => reveal(node)}>
        {scores.length > 1 && (
          <>
            <OptionLabel>Tu nota</OptionLabel>
            {scores.map(({ value, label }) => (
              <FocusButton
                key={value}
                variant="chip"
                className="mr-3 mb-3"
                active={value === view.score}
                onSelect={() => onChange({ score: value })}
              >
                {label}
              </FocusButton>
            ))}
          </>
        )}
        {formats.length > 1 && (
          <>
            <OptionLabel className={scores.length > 1 ? "ml-6" : undefined}>Formato</OptionLabel>
            {[{ value: "any", label: "Todos" }, ...formats].map(({ value, label }) => (
              <FocusButton
                key={value}
                variant="chip"
                className="mr-3 mb-3"
                active={value === view.format}
                onSelect={() => onChange({ format: value })}
              >
                {label}
              </FocusButton>
            ))}
          </>
        )}
      </FocusGroup>
    </>
  );
}

const SELECT =
  "h-10 pl-3 pr-8 rounded-lg bg-zinc-900 border border-zinc-700 text-sm text-zinc-100 hover:border-zinc-500";

function WebOptions({ formats, scores, view, onChange }: MyListControlsProps) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 mt-2 text-sm text-zinc-400">
      <label className="flex items-center gap-2">
        Ordenar por
        <select value={view.sort} onChange={(e) => onChange({ sort: e.target.value as ListSort })} className={SELECT}>
          {LIST_SORTS.map(({ value, label }) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </label>
      {scores.length > 1 && (
        <label className="flex items-center gap-2">
          Tu nota
          <select
            value={view.score}
            onChange={(e) => onChange({ score: e.target.value as ScoreFilter })}
            className={SELECT}
          >
            {scores.map(({ value, label }) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
      )}
      {formats.length > 1 && (
        <label className="flex items-center gap-2">
          Formato
          <select value={view.format} onChange={(e) => onChange({ format: e.target.value })} className={SELECT}>
            <option value="any">Todos</option>
            {formats.map(({ value, label, count }) => (
              <option key={value} value={value}>
                {label} ({count})
              </option>
            ))}
          </select>
        </label>
      )}
    </div>
  );
}
