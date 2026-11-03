import { useState } from "react";
import type { CatalogItem } from "@/lib/anilist/types";
import type { EntryChanges } from "@/lib/trackers/types";
import { removeFromRemote, updateRemoteEntry } from "./sync";

/** Edits one anime's entry on the remote list, one request at a time */
export function useEntryEditor(anime: CatalogItem) {
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);

  const run = async (request: () => Promise<boolean>) => {
    if (saving) return false;
    setSaving(true);
    setFailed(false);
    const ok = await request();
    setSaving(false);
    setFailed(!ok);
    return ok;
  };

  return {
    saving,
    failed,
    update: (changes: EntryChanges) => run(() => updateRemoteEntry(anime, changes)),
    remove: () => run(() => removeFromRemote(anime)),
  };
}
