"use client";

import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

export interface SelectOption<T extends string | number> {
  value: T;
  label: React.ReactNode;
  /** Plain text of the label, for type-to-select when the label is not a string */
  text?: string;
  /** Muted text at the end of the row, e.g. a count */
  hint?: React.ReactNode;
}

const TYPEAHEAD_RESET_MS = 600;
// Tall enough for a dozen options without scrolling (the 1–10 score list fits whole)
const MENU_MAX_HEIGHT = 420;
const OPTION_HEIGHT = 36;

const optionText = <T extends string | number>(o: SelectOption<T>) =>
  (o.text ?? (typeof o.label === "string" || typeof o.label === "number" ? String(o.label) : String(o.value))).toLowerCase();

/**
 * Dropdown for the web layout, replacing the native <select> (whose open menu the system
 * draws and CSS can't style). Follows the select-only combobox pattern: arrows, Home/End,
 * Enter/Space, Esc and typing the start of an option all work from the keyboard.
 */
export function Select<T extends string | number>({
  value,
  options,
  onChange,
  label,
  ariaLabel,
  labelPosition = "left",
  disabled = false,
  className,
  labelClassName,
  buttonClassName,
}: {
  value: T;
  options: SelectOption<T>[];
  onChange: (value: T) => void;
  /** Visible label; without it pass ariaLabel */
  label?: string;
  ariaLabel?: string;
  labelPosition?: "left" | "top";
  disabled?: boolean;
  className?: string;
  labelClassName?: string;
  buttonClassName?: string;
}) {
  const id = useId();
  const labelId = `${id}-label`;
  const valueId = `${id}-value`;
  const listId = `${id}-list`;
  const optionId = (i: number) => `${id}-opt-${i}`;

  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const typed = useRef({ text: "", at: 0 });
  // The pointer highlights what is under it; only keyboard moves should scroll the list
  const activeFromPointer = useRef(false);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [position, setPosition] = useState<React.CSSProperties | null>(null);

  const selectedIndex = Math.max(
    0,
    options.findIndex((o) => o.value === value)
  );
  const selected = options[selectedIndex];

  const openMenu = (index = selectedIndex) => {
    if (disabled) return;
    setActive(index);
    setOpen(true);
  };
  const close = (refocus = true) => {
    setOpen(false);
    if (refocus) buttonRef.current?.focus();
  };
  const choose = (index: number) => {
    const option = options[index];
    if (option && option.value !== value) onChange(option.value);
    close();
  };

  // The menu is position: fixed, placed from the button, so no scrolling container (the filter
  // sidebar, the phone sheet) can clip it. It opens upwards when there is more room there.
  const place = useCallback(() => {
    const rect = buttonRef.current?.getBoundingClientRect();
    if (!rect) return;
    const gap = 6;
    const below = window.innerHeight - rect.bottom - gap - 8;
    const above = rect.top - gap - 8;
    const wanted = Math.min(MENU_MAX_HEIGHT, options.length * OPTION_HEIGHT + 10);
    const up = below < wanted && above > below;
    setPosition({
      left: rect.left,
      minWidth: rect.width,
      maxWidth: Math.max(rect.width, window.innerWidth - rect.left - 8),
      ...(up
        ? { bottom: window.innerHeight - rect.top + gap, maxHeight: Math.min(MENU_MAX_HEIGHT, above) }
        : { top: rect.bottom + gap, maxHeight: Math.min(MENU_MAX_HEIGHT, below) }),
    });
  }, [options.length]);

  // Placed before paint and kept in place while anything scrolls
  useLayoutEffect(() => {
    if (!open) {
      setPosition(null);
      return;
    }
    place();
    // Scrolling the menu itself moves nothing; any other scroll (page, sidebar) moves the button
    const onScroll = (e: Event) => {
      if (e.target !== listRef.current) place();
    };
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", place);
    return () => {
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", place);
    };
  }, [open, place]);

  // Once placed (it is hidden until then, and hidden elements can't take focus) the list
  // takes the keyboard
  const placed = position !== null;
  useEffect(() => {
    if (open && placed) listRef.current?.focus({ preventScroll: true });
  }, [open, placed]);

  // The active option comes into view when the menu opens and while moving with the keys (only
  // the list scrolls). Not when the pointer picked it: that option is already under the pointer,
  // and scrolling to it would fight the wheel.
  useEffect(() => {
    if (activeFromPointer.current) {
      activeFromPointer.current = false;
      return;
    }
    const list = listRef.current;
    const option = open ? document.getElementById(optionId(active)) : null;
    if (!list || !option) return;
    if (option.offsetTop < list.scrollTop) list.scrollTop = option.offsetTop - 4;
    else if (option.offsetTop + option.offsetHeight > list.scrollTop + list.clientHeight)
      list.scrollTop = option.offsetTop + option.offsetHeight - list.clientHeight + 4;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, active, placed]);

  // A press anywhere else closes it
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) close(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  const typeahead = (key: string) => {
    const now = Date.now();
    const t = typed.current;
    t.text = now - t.at > TYPEAHEAD_RESET_MS ? key.toLowerCase() : t.text + key.toLowerCase();
    t.at = now;
    const from = open ? active : selectedIndex;
    // A repeated single letter cycles through the options that start with it
    const start = t.text.length === 1 ? from + 1 : from;
    for (let n = 0; n < options.length; n++) {
      const i = (start + n) % options.length;
      if (optionText(options[i]).startsWith(t.text)) return i;
    }
    return -1;
  };

  const onButtonKeyDown = (e: React.KeyboardEvent) => {
    if (["ArrowDown", "ArrowUp", "Enter", " "].includes(e.key)) {
      e.preventDefault();
      openMenu(e.key === "ArrowUp" ? Math.max(0, selectedIndex - 1) : selectedIndex);
    } else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
      const i = typeahead(e.key);
      if (i >= 0) openMenu(i);
    }
  };

  const onListKeyDown = (e: React.KeyboardEvent) => {
    const last = options.length - 1;
    const move = (i: number) => {
      e.preventDefault();
      setActive(Math.max(0, Math.min(last, i)));
    };
    switch (e.key) {
      case "ArrowDown":
        return move(active + 1);
      case "ArrowUp":
        return move(active - 1);
      case "Home":
        return move(0);
      case "End":
        return move(last);
      case "PageDown":
        return move(active + 6);
      case "PageUp":
        return move(active - 6);
      case "Enter":
      case " ":
        e.preventDefault();
        return choose(active);
      case "Escape":
        e.preventDefault();
        return close();
      case "Tab":
        return close(false);
      default:
        if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
          const i = typeahead(e.key);
          if (i >= 0) setActive(i);
        }
    }
  };

  return (
    <div
      ref={rootRef}
      className={cn(labelPosition === "top" ? "flex flex-col gap-1.5" : "inline-flex items-center gap-2", className)}
    >
      {label && (
        <span id={labelId} onClick={() => buttonRef.current?.focus()} className={cn("text-sm text-zinc-400", labelClassName)}>
          {label}
        </span>
      )}
      {/* The menu hangs from the button, as wide as it at least */}
      <div className="relative">
        <button
          ref={buttonRef}
          type="button"
          role="combobox"
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-controls={listId}
          aria-labelledby={label ? `${labelId} ${valueId}` : undefined}
          aria-label={label ? undefined : ariaLabel}
          disabled={disabled}
          onClick={() => (open ? close() : openMenu())}
          onKeyDown={onButtonKeyDown}
          className={cn(
            "inline-flex items-center justify-between gap-3 h-10 min-w-[8rem] pl-3 pr-2.5 rounded-lg",
            "bg-zinc-900 border text-sm text-zinc-100 text-left transition-colors",
            "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white",
            "disabled:opacity-60 disabled:cursor-not-allowed",
            open ? "border-zinc-400 bg-zinc-800" : "border-zinc-700 hover:border-zinc-500 hover:bg-zinc-800/60",
            buttonClassName
          )}
        >
          <span id={valueId} className="flex items-center min-w-0 truncate">
            {selected?.label}
          </span>
          <ChevronDown
            aria-hidden
            className={cn("w-4 h-4 flex-shrink-0 text-zinc-400 transition-transform duration-150", open && "rotate-180")}
          />
        </button>

        {open && (
          <ul
            ref={listRef}
            id={listId}
            role="listbox"
            tabIndex={-1}
            aria-labelledby={label ? labelId : undefined}
            aria-label={label ? undefined : ariaLabel}
            aria-activedescendant={optionId(active)}
            onKeyDown={onListKeyDown}
            onBlur={(e) => {
              if (!rootRef.current?.contains(e.relatedTarget as Node)) close(false);
            }}
            style={position ?? { visibility: "hidden" }}
            className="fixed z-50 w-max p-1 overflow-y-auto overscroll-contain rounded-xl bg-zinc-900 border border-zinc-700 shadow-[0_1rem_2.5rem_rgba(0,0,0,0.7)] outline-none pk-menu-scroll tv-fade-in"
          >
            {options.map((option, i) => {
              const isSelected = i === selectedIndex;
              return (
                <li
                  key={String(option.value)}
                  id={optionId(i)}
                  role="option"
                  aria-selected={isSelected}
                  onPointerMove={() => {
                    if (i === active) return;
                    activeFromPointer.current = true;
                    setActive(i);
                  }}
                  onClick={() => choose(i)}
                  className={cn(
                    "flex items-center gap-3 h-9 px-2.5 rounded-lg text-sm whitespace-nowrap cursor-pointer select-none",
                    i === active ? "bg-zinc-800 text-white" : "text-zinc-300",
                    isSelected && "font-semibold text-white"
                  )}
                >
                  <Check aria-hidden className={cn("w-4 h-4 flex-shrink-0", isSelected ? "text-white" : "invisible")} />
                  <span className="flex items-center flex-1 min-w-0">{option.label}</span>
                  {option.hint !== undefined && <span className="ml-4 text-xs text-zinc-500 tabular-nums">{option.hint}</span>}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
