"use client";

import { useState } from "react";
import { Download, Upload } from "lucide-react";
import { useMyList } from "@/lib/library/my-list";
import { useRemoteLibrary } from "@/lib/library/remote";
import {
  exportToRemote,
  importFromRemote,
  pendingExport,
  pendingImport,
  type PendingChange,
  type TransferResult,
} from "@/lib/library/sync";
import { FocusButton, FocusGroup } from "./focusable";
import { useRevealOnFocus } from "./page-frame";

const series = (n: number) => `${n} ${n === 1 ? "serie" : "series"}`;

/** "3 series que AniList no tiene y más progreso o notas en 2 series" */
function describe(pending: PendingChange[], missingFrom: string) {
  const added = pending.filter((p) => p.isNew).length;
  const updated = pending.length - added;
  const parts = [];
  if (added) parts.push(`${series(added)} que ${missingFrom} no tiene`);
  if (updated) parts.push(`más progreso o notas en ${series(updated)}`);
  return parts.join(" y ");
}

function summary({ added, updated, failed }: TransferResult, into: string) {
  const parts = [];
  if (added) parts.push(`${series(added)} ${added === 1 ? "añadida" : "añadidas"} a ${into}`);
  if (updated) parts.push(`${series(updated)} ${updated === 1 ? "actualizada" : "actualizadas"}`);
  if (failed) parts.push(`${failed} con error`);
  return parts.length ? parts.join(" · ") : "No había nada nuevo que copiar.";
}

/**
 * Import and export between this device's list and the signed-in service. Either way only
 * what the other side lacks is copied (see lib/library/sync.ts), so running both leaves the
 * two lists with everything either had.
 */
export function ListTransfer() {
  const remote = useRemoteLibrary();
  const myList = useMyList();
  const reveal = useRevealOnFocus();
  const [running, setRunning] = useState<{ done: number; total: number } | null>(null);
  const [result, setResult] = useState<string | null>(null);

  if (!remote) return null;
  const name = remote.provider.name;
  const toExport = pendingExport(myList, remote);
  const toImport = pendingImport(myList, remote);

  const runExport = async () => {
    if (running) return;
    setResult(null);
    setRunning({ done: 0, total: toExport.length });
    const res = await exportToRemote(toExport, (done) => setRunning({ done, total: toExport.length }));
    setRunning(null);
    setResult(summary(res, name));
  };

  const runImport = () => {
    if (running) return;
    setResult(summary(importFromRemote(toImport), "este dispositivo"));
  };

  const line = "text-[0.95rem] text-zinc-400 tv:text-xl";

  return (
    <div>
      {toExport.length === 0 && toImport.length === 0 ? (
        <p className={line}>Este dispositivo y {name} tienen lo mismo.</p>
      ) : (
        <>
          {toExport.length > 0 && <p className={line}>Este dispositivo tiene {describe(toExport, name)}.</p>}
          {toImport.length > 0 && (
            <p className={`mt-1 ${line}`}>
              {name} tiene {describe(toImport, "este dispositivo")}.
            </p>
          )}
          <FocusGroup className="flex flex-wrap mt-4 tv:mt-5" onFocusInside={(node) => reveal(node)}>
            {toExport.length > 0 && (
              <FocusButton variant="primary" className="mr-3 mb-2 tv:mr-4" onSelect={runExport}>
                <Upload className="w-5 h-5 mr-2 tv:w-6 tv:h-6 tv:mr-3" />
                {running ? `Exportando… ${running.done} de ${running.total}` : `Exportar a ${name}`}
              </FocusButton>
            )}
            {toImport.length > 0 && (
              <FocusButton variant="secondary" className="mb-2" onSelect={runImport}>
                <Download className="w-5 h-5 mr-2 tv:w-6 tv:h-6 tv:mr-3" />
                Importar de {name}
              </FocusButton>
            )}
          </FocusGroup>
        </>
      )}
      {result && <p className="mt-3 text-[0.95rem] text-zinc-300 tv:text-xl">{result}</p>}
    </div>
  );
}
