import { useState } from "react";
import type { CatalogItem } from "@/lib/anilist/types";
import type { EntryChanges } from "@/lib/trackers/types";
import { removeLocalEntry, updateLocalEntry } from "./my-list";
import { removeFromRemote, updateRemoteEntry } from "./sync";

/** Where the anime page's edits go: the signed-in list service (also copied here) or only this device */
export type EditTarget = "remote" | "local";

/** Edits one anime's list entry, one request at a time */
export function useEntryEditor(anime: CatalogItem, target: EditTarget) {
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

  if (target === "local") {
    return {
      saving: false,
      failed: false,
      update: async (changes: EntryChanges) => {
        updateLocalEntry(anime, changes);
        return true;
      },
      remove: async () => {
        removeLocalEntry(anime.id);
        return true;
      },
    };
  }

  return {
    saving,
    failed,
    update: (changes: EntryChanges) => run(() => updateRemoteEntry(anime, changes)),
    remove: () => run(() => removeFromRemote(anime)),
  };
}
