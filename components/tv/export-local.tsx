"use client";

import { useState } from "react";
import { Upload } from "lucide-react";
import { useWatchHistory } from "@/lib/library/history";
import { useMyList } from "@/lib/library/my-list";
import { useRemoteLibrary } from "@/lib/library/remote";
import { exportToRemote, pendingExport, type ExportResult } from "@/lib/library/sync";
import { FocusButton, FocusGroup } from "./focusable";
import { useRevealOnFocus } from "./page-frame";

const series = (n: number) => `${n} ${n === 1 ? "serie" : "series"}`;

function describe(plan: number, progress: number) {
  const parts = [];
  if (plan) parts.push(`${series(plan)} de Mi lista`);
  if (progress) parts.push(`el progreso de ${series(progress)}`);
  return parts.join(" y ");
}

function summary({ added, progressSaved, failed }: ExportResult) {
  const parts = [];
  if (added) parts.push(`${series(added)} añadidas como pendientes`);
  if (progressSaved) parts.push(`${progressSaved} ${progressSaved === 1 ? "progreso actualizado" : "progresos actualizados"}`);
  if (failed) parts.push(`${failed} con error`);
  return parts.length ? parts.join(" · ") : "No había nada nuevo que exportar.";
}

/** Copies what exists only on this device (Mi lista and watch progress) to the remote list */
export function ExportLocal() {
  const remote = useRemoteLibrary();
  const myList = useMyList();
  const history = useWatchHistory();
  const reveal = useRevealOnFocus();
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<ExportResult | null>(null);

  if (!remote) return null;
  const pending = pendingExport(myList, history, remote);
  const count = pending.plan.length + pending.progress.length;
  const name = remote.provider.name;

  const run = async () => {
    if (running) return;
    setRunning(true);
    setResult(await exportToRemote(pending));
    setRunning(false);
  };

  return (
    <div>
      <p className="text-[0.95rem] text-zinc-400 tv:text-xl">
        {count === 0
          ? `Todo lo de este dispositivo está ya en ${name}.`
          : `Solo en este dispositivo: ${describe(pending.plan.length, pending.progress.length)}.`}
      </p>
      {count > 0 && (
        <FocusGroup className="mt-4 tv:mt-5" onFocusInside={(node) => reveal(node)}>
          <FocusButton variant="primary" onSelect={run}>
            <Upload className="w-5 h-5 mr-2 tv:w-6 tv:h-6 tv:mr-3" />
            {running ? "Exportando…" : `Exportar a ${name}`}
          </FocusButton>
        </FocusGroup>
      )}
      {result && <p className="mt-4 text-[0.95rem] text-zinc-300 tv:text-xl">{summary(result)}</p>}
    </div>
  );
}
