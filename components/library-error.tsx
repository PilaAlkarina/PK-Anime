"use client";

import type { LucideIcon } from "lucide-react";
import { Stamp } from "@/components/brand";
import { FocusButton, FocusGroup, Screen } from "@/components/tv/focusable";
import { cn } from "@/lib/utils";

export interface LibraryErrorAction {
  label: string;
  icon?: LucideIcon;
  onSelect: () => void;
  primary?: boolean;
}

/**
 * A whole-page problem in the library (an anime or address that doesn't exist, a screen that
 * failed to load): a stamp, what happened, the cause in small print when there is one and the
 * ways out, beside a large outlined figure ("404", 失敗) with the accent offset behind. Both
 * interfaces, under the top bar or beside the rail; the buttons take the remote's focus on TV.
 */
export function LibraryErrorScreen({
  figure,
  stamp,
  japanese,
  title,
  text,
  cause,
  actions,
}: {
  /** The large outlined figure on the right */
  figure: string;
  stamp: string;
  japanese: string;
  title: string;
  text: string;
  /** The technical cause, in small print ("AniList no responde (502)") */
  cause?: string | null;
  actions: LibraryErrorAction[];
}) {
  const japaneseFigure = /[^\x00-\x7F]/.test(figure);
  return (
    <Screen className="relative flex items-center min-h-[calc(100vh-4rem)] px-6 py-16 overflow-hidden md:px-20 tv:min-h-screen tv:pl-[8rem] tv:pr-[8rem]">
      <div
        aria-hidden="true"
        className="absolute inset-0 screentone [mask-image:radial-gradient(ellipse_at_75%_55%,#000,transparent_60%)]"
      />
      <div className="relative flex w-full items-center gap-12 tv:gap-16">
        <div className="flex flex-col flex-1 items-start gap-4 tv:gap-[1.4rem]">
          <Stamp japanese={japanese} className="text-[0.78rem] tv:text-[1.1rem]">
            {stamp}
          </Stamp>
          <h1 className="font-display leading-[1.1] [text-wrap:balance] text-[2rem] md:text-[2.6rem] tv:text-[4.2rem]">{title}</h1>
          <p className="max-w-[34em] leading-[1.55] text-zinc-400 text-[0.98rem] tv:text-[1.45rem] tv:max-w-[40em]">{text}</p>
          {cause && (
            <code className="px-3 py-1.5 rounded-lg border border-dashed border-line font-mono text-zinc-500 text-xs tv:text-[1.1rem]">
              {cause}
            </code>
          )}
          <FocusGroup className="flex flex-wrap gap-3 mt-2 tv:gap-[1.3rem] tv:mt-3">
            {actions.map(({ label, icon: Icon, onSelect, primary }) => (
              <FocusButton key={label} variant={primary ? "primary" : "secondary"} onSelect={onSelect}>
                {Icon && <Icon className="w-[1.1em] h-[1.1em] mr-2" />}
                {label}
              </FocusButton>
            ))}
          </FocusGroup>
        </div>
        {/* Outlined in paper, with an accent copy offset behind */}
        <span
          aria-hidden="true"
          lang={japaneseFigure ? "ja" : undefined}
          className={cn(
            "relative hidden sm:block flex-none font-display leading-[0.85] whitespace-nowrap select-none",
            "text-[7rem] md:text-[11rem] tv:text-[15rem]",
            japaneseFigure && "tracking-[-0.02em]"
          )}
        >
          <span className="absolute left-[0.05em] top-[0.05em] text-transparent [-webkit-text-stroke:0.018em_rgb(var(--c-accent))]">
            {figure}
          </span>
          <span className="relative text-transparent [-webkit-text-stroke:0.018em_rgb(var(--c-paper))]">{figure}</span>
        </span>
      </div>
    </Screen>
  );
}
