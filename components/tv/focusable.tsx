"use client";

import { useEffect } from "react";
import {
  FocusContext,
  useFocusable,
  type FocusDetails,
  type UseFocusableConfig,
} from "@noriginmedia/norigin-spatial-navigation";
import { cn } from "@/lib/utils";
import { useIsTv } from "@/components/ui-mode";

/** Set on focus that came from the mouse (or an LG Magic Remote pointer), see useTvFocusable */
export const isPointerFocus = (details?: FocusDetails) => !!details?.pointer;

/**
 * useFocusable plus pointer support: hovering focuses, clicking selects. Focus handlers can
 * check isPointerFocus(details) to skip auto-scrolling, which would otherwise slide items
 * out from under the cursor.
 */
export function useTvFocusable<P = object>({
  onSelect,
  ...config
}: UseFocusableConfig<P> & { onSelect?: () => void }) {
  const result = useFocusable<P>({ ...config, onEnterPress: onSelect ? () => onSelect() : config.onEnterPress });
  const pointerProps = {
    tabIndex: -1,
    // mousemove with real movement, not mouseenter: when the content scrolls under a resting
    // cursor the browser fires enter events (and zero-movement moves) that would steal focus
    onMouseMove: (e: React.MouseEvent) => {
      if ((e.movementX || e.movementY) && !result.focused) result.focusSelf({ pointer: true });
    },
    onClick: onSelect,
  };
  return { ...result, pointerProps };
}

// segment: one side of a segmented control, transparent on its track until selected
type ButtonVariant = "primary" | "secondary" | "chip" | "segment";

const VARIANTS: Record<ButtonVariant, { base: string; rest: string; focused: string }> = {
  // Focus is a "koma" pop: paper face and a hard accent shadow, the panel lifting off the page.
  // `rest` is left out while focused, so its shadow never fights the koma one
  primary: {
    base: "h-14 px-8 rounded-full text-xl font-bold",
    rest: "bg-red-500 text-black shadow-hard",
    focused: "bg-white text-black koma",
  },
  secondary: {
    base: "h-14 px-6 rounded-full border-[1.5px] text-xl font-bold",
    rest: "bg-ink-3 border-line text-white",
    focused: "bg-white border-white text-black koma",
  },
  chip: {
    base: "h-11 px-5 rounded-full border-[1.5px] text-lg font-bold",
    rest: "bg-ink-3 border-line text-zinc-200",
    focused: "relative z-10 bg-white border-white text-black shadow-hard-accent",
  },
  segment: {
    base: "h-11 px-5 rounded-full border-[1.5px] text-lg font-bold",
    rest: "bg-transparent border-transparent text-zinc-400",
    focused: "relative z-10 bg-white border-white text-black shadow-hard-accent",
  },
};

interface FocusButtonProps {
  onSelect: () => void;
  focusKey?: string;
  variant?: ButtonVariant;
  /** Selected state for toggles and tabs, shown when not focused */
  active?: boolean;
  className?: string;
  children: React.ReactNode;
}

// The web layout's buttons: hover and keyboard focus instead of spatial focus
const WEB_VARIANTS: Record<ButtonVariant, { base: string; active: string }> = {
  primary: {
    base: "h-11 px-6 rounded-full bg-red-500 text-black text-[0.95rem] font-bold shadow-hard hover:bg-red-400",
    active: "",
  },
  secondary: {
    base: "h-11 px-5 rounded-full bg-ink-3 border-[1.5px] border-line text-white text-[0.95rem] font-bold hover:bg-zinc-800",
    active: "bg-white border-white text-black hover:bg-zinc-200",
  },
  chip: {
    base: "h-10 px-4 rounded-full bg-ink-3 border-[1.5px] border-line text-zinc-200 text-sm font-bold hover:bg-zinc-800",
    active: "bg-white border-white text-black hover:bg-zinc-200",
  },
  segment: {
    base: "h-10 px-4 rounded-full border-[1.5px] border-transparent text-zinc-400 text-sm font-bold hover:text-white",
    active: "bg-white border-white text-black hover:text-black",
  },
};

function WebButton({ onSelect, variant = "secondary", active = false, className, children }: FocusButtonProps) {
  const styles = WEB_VARIANTS[variant];
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={variant === "primary" ? undefined : active}
      className={cn(
        "inline-flex items-center justify-center whitespace-nowrap transition-colors duration-150",
        "outline-none focus-visible:koma-sm",
        styles.base,
        active && styles.active,
        className
      )}
    >
      {children}
    </button>
  );
}

export function FocusButton(props: FocusButtonProps) {
  return useIsTv() ? <TvButton {...props} /> : <WebButton {...props} />;
}

function TvButton({ onSelect, focusKey, variant = "secondary", active = false, className, children }: FocusButtonProps) {
  const { ref, focused, pointerProps } = useTvFocusable({ focusKey, onSelect });
  const styles = VARIANTS[variant];
  return (
    <button
      ref={ref}
      type="button"
      {...pointerProps}
      className={cn(
        "inline-flex items-center justify-center whitespace-nowrap outline-none transition-transform duration-150",
        styles.base,
        !focused && styles.rest,
        // Selected toggles and tabs: paper face, ink text
        active && !focused && "bg-white border-white text-black",
        focused && styles.focused,
        className
      )}
    >
      {children}
    </button>
  );
}

/**
 * Focus container for a page's content. Focuses its first child on mount, or as soon as
 * `ready` turns true for screens whose content loads on the client.
 */
export function Screen(props: { ready?: boolean; className?: string; children: React.ReactNode }) {
  return useIsTv() ? <TvScreen {...props} /> : <div className={props.className}>{props.children}</div>;
}

function TvScreen({
  ready = true,
  className,
  children,
}: {
  ready?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  const { ref, focusKey, focusSelf } = useFocusable({ trackChildren: true, saveLastFocusedChild: true });

  useEffect(() => {
    if (ready) focusSelf();
  }, [ready]);

  return (
    <FocusContext.Provider value={focusKey}>
      <div ref={ref} className={className}>
        {children}
      </div>
    </FocusContext.Provider>
  );
}

/** Groups focusables (a row, a grid, a button bar) so navigation remembers the last one used */
interface FocusGroupProps {
  className?: string;
  children: React.ReactNode;
  onFocusInside?: (node: HTMLElement) => void;
  focusKey?: string;
  preferredChildFocusKey?: string;
}

export function FocusGroup(props: FocusGroupProps) {
  return useIsTv() ? <TvFocusGroup {...props} /> : <div className={props.className}>{props.children}</div>;
}

function TvFocusGroup({
  className,
  children,
  onFocusInside,
  focusKey: propFocusKey,
  preferredChildFocusKey,
}: FocusGroupProps) {
  const { ref, focusKey, hasFocusedChild } = useFocusable({
    focusKey: propFocusKey,
    trackChildren: true,
    saveLastFocusedChild: true,
    preferredChildFocusKey,
  });

  useEffect(() => {
    if (hasFocusedChild && ref.current) onFocusInside?.(ref.current);
  }, [hasFocusedChild]);

  return (
    <FocusContext.Provider value={focusKey}>
      <div ref={ref} className={className}>
        {children}
      </div>
    </FocusContext.Provider>
  );
}
