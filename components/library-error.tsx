"use client";

import { Stamp } from "@/components/brand";
import { FocusButton, FocusGroup, Screen } from "@/components/tv/focusable";
import { cn } from "@/lib/utils";

export interface LibraryErrorAction {
  label: string;
  onSelect: () => void;
  primary?: boolean;
}

/**
 * A whole-page problem in the library (an anime or address that doesn't exist, a screen that
 * failed to load): a stamp with the code, what happened and the ways out. Both interfaces; the
 * buttons are focusable with the remote on TV.
 */
export function LibraryErrorScreen({
  code,
  stamp,
  japanese,
  title,
  text,
  actions,
}: {
  /** Large outlined figure behind the text ("404"); none for errors without one */
  code?: string;
  stamp: string;
  japanese: string;
  title: string;
  text: string;
  actions: LibraryErrorAction[];
}) {
  return (
    <Screen className="relative flex items-center min-h-[70vh] px-6 py-16 overflow-hidden md:px-12 tv:min-h-screen tv:pl-[10rem]">
      <div aria-hidden="true" className="absolute inset-0 screentone [mask-image:radial-gradient(ellipse_at_70%_50%,#000,transparent_65%)]" />
      {code && (
        <span
          aria-hidden="true"
          className="absolute right-[4%] top-1/2 -translate-y-1/2 font-display leading-none text-transparent text-outline-thick opacity-40 select-none text-[9rem] md:text-[16rem] tv:text-[22rem]"
        >
          {code}
        </span>
      )}
      <div className="relative flex flex-col items-start gap-4 max-w-xl tv:gap-6 tv:max-w-[56rem]">
        <Stamp japanese={japanese} className="text-[11px] sm:text-[13px] tv:text-lg">
          {stamp}
        </Stamp>
        <h1 className="font-display text-3xl leading-tight md:text-[2.6rem] tv:text-[4rem]">{title}</h1>
        <p className="text-base text-zinc-300 md:text-lg tv:text-2xl">{text}</p>
        <FocusGroup className="flex flex-wrap gap-3 mt-2 tv:gap-4 tv:mt-4">
          {actions.map((action) => (
            <FocusButton
              key={action.label}
              variant={action.primary ? "primary" : "secondary"}
              className={cn(!action.primary && "tv:bg-ink-3")}
              onSelect={action.onSelect}
            >
              {action.label}
            </FocusButton>
          ))}
        </FocusGroup>
      </div>
    </Screen>
  );
}
