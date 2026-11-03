"use client";

import { usePathname, useRouter } from "next/navigation";
import { Bookmark, CalendarDays, Home, LayoutGrid, Search, Settings, type LucideIcon } from "lucide-react";
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
  expanded,
}: {
  href: string;
  label: string;
  icon: LucideIcon;
  active: boolean;
  expanded: boolean;
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
        "flex items-center h-14 w-full pl-5 pr-6 rounded-full outline-none transition-colors duration-150",
        focused ? "bg-white text-black" : active ? "text-white" : "text-zinc-500"
      )}
    >
      <Icon className="w-7 h-7 flex-shrink-0" strokeWidth={active || focused ? 2.5 : 2} />
      <span
        className={cn(
          "ml-5 text-xl font-bold whitespace-nowrap transition-opacity duration-150",
          expanded ? "opacity-100" : "opacity-0"
        )}
      >
        {label}
      </span>
    </button>
  );
}

/** Left rail. Collapsed to icons; expands with labels while it has focus */
export function Sidebar() {
  const pathname = usePathname();
  const hidden = pathname.startsWith("/watch/");
  const activeHref = ITEMS.find((item) => isActive(pathname, item.href))?.href ?? "/";
  const { ref, focusKey, hasFocusedChild } = useFocusable({
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
        className={cn(
          "fixed top-0 bottom-0 left-0 z-40 flex flex-col justify-center pl-6 pr-4 transition-all duration-200",
          hasFocusedChild
            ? "w-[20rem] bg-gradient-to-r from-black via-black/95 to-transparent"
            : "w-[7rem] bg-gradient-to-r from-black/80 to-transparent"
        )}
      >
        <div className="absolute top-10 left-8 text-2xl font-bold tracking-tight text-white">
          PK<span className="text-zinc-500">{hasFocusedChild ? " Anime" : ""}</span>
        </div>
        <div className="space-y-2">
          {ITEMS.map((item) => (
            <SidebarItem
              key={item.href}
              {...item}
              active={item.href === activeHref}
              expanded={hasFocusedChild}
            />
          ))}
        </div>
      </nav>
    </FocusContext.Provider>
  );
}
