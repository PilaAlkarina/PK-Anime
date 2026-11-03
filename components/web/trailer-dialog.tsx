"use client";

import { useEffect, useRef } from "react";
import { X } from "lucide-react";

/** Trailer over the page: Esc, the × or a click outside the video closes it */
export function TrailerDialog({ src, title, onClose }: { src: string; title: string; onClose: () => void }) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCloseRef.current();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
      // Back to the button that opened it, for keyboard users
      opener?.focus();
    };
  }, []);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Tráiler de ${title}`}
      onClick={onClose}
      className="fixed top-0 left-0 z-50 flex items-center justify-center w-full h-full p-3 sm:p-8 bg-black/85"
    >
      <div onClick={(e) => e.stopPropagation()} className="relative w-full max-w-5xl">
        <div className="flex items-center justify-between gap-4 mb-3">
          <p className="text-sm sm:text-base font-semibold text-zinc-200 truncate">Tráiler · {title}</p>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label="Cerrar tráiler"
            className="flex flex-shrink-0 items-center justify-center w-11 h-11 rounded-full bg-white/10 hover:bg-white/20"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="relative pt-[56.25%] rounded-xl sm:rounded-2xl overflow-hidden bg-zinc-950 shadow-2xl">
          <iframe
            src={src}
            title={`Tráiler de ${title}`}
            allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
            allowFullScreen
            // YouTube refuses to play (error 153) when the embed sends no Referer
            referrerPolicy="strict-origin-when-cross-origin"
            className="absolute top-0 left-0 w-full h-full border-0"
          />
        </div>
      </div>
    </div>
  );
}
