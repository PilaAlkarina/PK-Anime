"use client";

import { Hanko } from "@/components/brand";
import { usePathname, useRouter } from "next/navigation";
import { Bookmark, CalendarDays, Home, LayoutGrid, Search, Settings, UserRound, type LucideIcon } from "lucide-react";
import { FocusContext, navigateByDirection, useFocusable } from "@noriginmedia/norigin-spatial-navigation";
import { useTvFocusable } from "./focusable";
import { cn } from "@/lib/utils";

const ITEMS: { href: string; label: string; icon: LucideIcon }[] = [
  { href: "/search", label: "Buscar", icon: Search },
  { href: "/", label: "Inicio", icon: Home },
  { href: "/schedule", label: "Calendario", icon: CalendarDays },
  { href: "/genres", label: "Géneros", icon: LayoutGrid },
  { href: "/my-list", label: "Mi lista", icon: Bookmark },
  { href: "/settings", label: "Ajustes", icon: Settings },
  { href: "/account", label: "Cuenta", icon: UserRound },
];

const navKey = (href: string) => `nav:${href}`;

function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}

function SidebarItem({
  href,
  label,
  icon: Icon,
  active,
}: {
  href: string;
  label: string;
  icon: LucideIcon;
  active: boolean;
}) {
  const router = useRouter();
  const { ref, focused, pointerProps } = useTvFocusable({
    focusKey: navKey(href),
    // Already there: hand focus back to the page instead of reloading it
    onSelect: () => (active ? navigateByDirection("right", {}) : router.push(href)),
  });

  return (
    <button
      ref={ref}
      type="button"
      {...pointerProps}
      className={cn(
        "flex flex-col items-center w-[5.5rem] py-2.5 rounded-2xl outline-none transition-colors duration-150",
        // The current section: raised ink, the icon in the accent and the label in paper
        focused ? "bg-white text-black" : active ? "bg-ink-3 text-red-500" : "text-zinc-400"
      )}
    >
      <Icon className="w-7 h-7 flex-shrink-0" strokeWidth={active || focused ? 2.5 : 2} />
      <span
        className={cn(
          "mt-1.5 text-[0.95rem] leading-tight whitespace-nowrap",
          active && !focused ? "font-black text-white" : "font-bold"
        )}
      >
        {label}
      </span>
    </button>
  );
}

/** Left rail: every section shows its name under the icon, so nothing has to be guessed */
export function Sidebar() {
  const pathname = usePathname();
  const hidden = pathname.startsWith("/watch/");
  const activeHref = ITEMS.find((item) => isActive(pathname, item.href))?.href ?? "/";
  const { ref, focusKey } = useFocusable({
    focusKey: "NAV",
    trackChildren: true,
    // Entering the rail always lands on the current page's item
    saveLastFocusedChild: false,
    preferredChildFocusKey: navKey(activeHref),
  });

  // The player takes the whole screen
  if (hidden) return null;

  return (
    <FocusContext.Provider value={focusKey}>
      <nav
        ref={ref}
        className="fixed top-0 bottom-0 left-0 z-40 flex flex-col items-center justify-center w-[7rem] bg-zinc-900 border-r border-line"
      >
        <div className="absolute top-9 flex flex-col items-center gap-2.5">
          <Hanko className="w-14 h-14 text-2xl" />
          <span lang="ja" aria-hidden="true" className="text-xs font-black tracking-[0.3em] text-zinc-400">
            アニメ
          </span>
        </div>
        <div className="space-y-2">
          {ITEMS.map((item) => (
            <SidebarItem
              key={item.href}
              {...item}
              active={item.href === activeHref}
            />
          ))}
        </div>
      </nav>
    </FocusContext.Provider>
  );
}
