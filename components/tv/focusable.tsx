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

type ButtonVariant = "primary" | "secondary" | "chip";

const VARIANTS: Record<ButtonVariant, { base: string; focused: string }> = {
  // Focus is a "koma" pop: paper face and a hard accent shadow, the panel lifting off the page
  primary: {
    base: "h-14 px-8 rounded-full bg-red-500 text-black text-xl font-bold",
    focused: "bg-white text-black shadow-hard-accent -translate-x-1 -translate-y-1",
  },
  secondary: {
    base: "h-14 px-6 rounded-full bg-white/10 text-zinc-200 text-xl",
    focused: "bg-white text-black shadow-hard-accent -translate-x-1 -translate-y-1",
  },
  chip: {
    base: "h-11 px-5 rounded-full bg-white/10 text-zinc-300 text-lg",
    focused: "bg-white text-black shadow-hard-accent",
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
    base: "h-11 px-5 rounded-full bg-white/10 text-zinc-100 text-[0.95rem] font-medium hover:bg-white/20",
    active: "bg-white text-black hover:bg-zinc-200",
  },
  chip: {
    base: "h-10 px-4 rounded-full bg-white/10 text-zinc-200 text-sm font-medium hover:bg-white/20",
    active: "bg-white text-black hover:bg-zinc-200",
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
        "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white",
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
        active && !focused && "bg-white/25 text-white",
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
