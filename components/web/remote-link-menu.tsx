"use client";

import { useEffect, useRef, useState } from "react";
import { Smartphone } from "lucide-react";
import { JapaneseLabel } from "@/components/brand";
import { RemoteLinkPanel } from "@/components/remote-link-panel";
import { useTvLink } from "@/components/tv/tv-link";
import { cn } from "@/lib/utils";

/**
 * Top bar button that links a phone as the remote, in a dropdown: the same QR and code as the
 * TV's Cuenta screen. A dot on the icon while a phone is linked.
 */
export function RemoteLinkMenu() {
  const { available, state } = useTvLink();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  // Closes on a click outside or Escape
  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (!available) return null;
  const linked = state.status === "linked";

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        aria-label={linked ? "Mando del móvil: vinculado" : "Usar el móvil como mando"}
        aria-expanded={open}
        aria-haspopup="dialog"
        title="Mando del móvil"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "relative flex items-center justify-center w-10 h-10 rounded-xl hover:bg-zinc-800",
          open ? "text-white bg-zinc-800" : "text-zinc-400"
        )}
      >
        <Smartphone className="w-5 h-5" />
        {linked && <span className="absolute top-2 right-2 w-2 h-2 rounded-full bg-red-500 ring-2 ring-black" />}
      </button>
      {open && (
        <div
          role="dialog"
          aria-label="Mando del móvil"
          className="absolute right-0 top-12 z-50 w-[22rem] p-5 rounded-2xl bg-zinc-900 border-[1.5px] border-line shadow-hard page-in"
        >
          <h2 className="mb-4 font-bold">
            Mando del móvil
            <JapaneseLabel title="Mando del móvil" />
          </h2>
          <RemoteLinkPanel />
        </div>
      )}
    </div>
  );
}
