"use client";

import { useEffect, useState } from "react";

const MAX_BATCH = 50;

// Synopses for the session, and the requests on their way, shared by every caller
const known = new Map<number, string>();
const pending = new Map<number, Promise<void>>();

/** Asks for `ids` not known or pending yet, in one request */
function load(ids: number[]): Promise<void> {
  const wanted = Array.from(new Set(ids)).filter((id) => !known.has(id) && !pending.has(id)).slice(0, MAX_BATCH);
  if (wanted.length === 0) return Promise.all(ids.map((id) => pending.get(id))).then(() => {});
  const request = fetch(`/api/catalog/descriptions?ids=${wanted.join(",")}`)
    .then((res) => res.json())
    .then((data) => {
      if (!data.success) return;
      for (const id of wanted) known.set(id, data.descriptions[id] ?? "");
    })
    .catch(() => {})
    .finally(() => wanted.forEach((id) => pending.delete(id)));
  wanted.forEach((id) => pending.set(id, request));
  return Promise.all([request, ...ids.map((id) => pending.get(id))]).then(() => {});
}

/**
 * The synopsis of `id`, fetched after a short pause (so holding an arrow doesn't fire one per
 * title). `batch` lists the titles likely next (the rest of its row): they come in the same
 * request, so moving along the row needs none.
 */
export function useSynopsis(id: number | null, { batch = [], delayMs = 300 }: { batch?: number[]; delayMs?: number } = {}) {
  const [text, setText] = useState<string | null>(id ? known.get(id) ?? null : null);
  const batchKey = batch.join(",");

  useEffect(() => {
    if (!id) return setText(null);
    if (known.has(id)) return setText(known.get(id)!);
    setText(null);
    let cancelled = false;
    const timer = setTimeout(() => {
      load([id, ...batch.filter((other) => other !== id)]).then(() => {
        if (!cancelled) setText(known.get(id) ?? null);
      });
    }, delayMs);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // batch is read through its key
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, batchKey, delayMs]);

  return text;
}

/** Fetches the synopses of `ids` ahead, in one request */
export function usePrefetchSynopses(ids: number[]) {
  const key = ids.join(",");
  useEffect(() => {
    if (ids.length > 0) load(ids);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
}
