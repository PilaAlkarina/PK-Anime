"use client";

import { Stamp } from "@/components/brand";
import { cn } from "@/lib/utils";

/**
 * Covers the player until the episode first plays: the episode's art blurred behind, the title
 * and an indeterminate bar, in the «Tinta y sello» style. It fades out when playback starts, so
 * entering the player never shows a bare black screen with a spinner.
 */
export function LoadingVeil({
  visible,
  poster,
  title,
  episodeLine,
}: {
  visible: boolean;
  poster?: string | null;
  title: string;
  episodeLine: string;
}) {
  return (
    <div
      aria-hidden={!visible}
      className={cn(
        "absolute inset-0 z-[35] flex items-center justify-center overflow-hidden bg-black transition-opacity duration-500 ease-out",
        visible ? "opacity-100" : "opacity-0 pointer-events-none"
      )}
    >
      {poster && (
        <img
          src={poster}
          alt=""
          decoding="async"
          className="absolute inset-0 w-full h-full object-cover scale-110 blur-2xl opacity-40"
        />
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-black via-black/60 to-black/40" />
      <div
        aria-hidden="true"
        className="absolute inset-0 screentone [mask-image:radial-gradient(ellipse_at_center,#000,transparent_70%)]"
      />

      <div role="status" className="relative flex flex-col items-center gap-3 px-6 text-center tv:gap-5">
        <Stamp japanese="読み込み中" className="text-[11px] sm:text-[13px] tv:text-lg">
          CARGANDO
        </Stamp>
        <p className="font-display text-2xl leading-tight line-clamp-2 sm:text-4xl tv:text-[3.5rem]">{title}</p>
        <p className="text-sm font-bold text-zinc-200 sm:text-lg tv:text-[1.75rem]">{episodeLine}</p>
        <div className="mt-2 w-40 h-1 rounded-full bg-white/[0.18] overflow-hidden sm:w-56 tv:w-80 tv:h-1.5">
          <div className="h-full w-1/3 rounded-full bg-red-500 loading-slide" />
        </div>
      </div>
    </div>
  );
}
