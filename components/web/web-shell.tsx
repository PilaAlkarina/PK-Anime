"use client";

import { Hanko } from "@/components/brand";
import { Suspense, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Bookmark, CalendarDays, Home, Search, Settings, User, type LucideIcon } from "lucide-react";
import { useAccount } from "@/lib/library/account";
import { WebNavigationProvider } from "@/components/tv/navigation-provider";
import { LibraryFooter } from "@/components/library-footer";
import { cn } from "@/lib/utils";

// Biblioteca is the advanced search: the whole catalog with every filter, genres included
const TOP_LINKS: { href: string; label: string; also?: string[] }[] = [
  { href: "/", label: "Inicio" },
  { href: "/search", label: "Biblioteca", also: ["/genres"] },
  { href: "/schedule", label: "Calendario" },
  { href: "/my-list", label: "Mi lista" },
];

// Géneros is reached from Buscar on phones, and Ajustes from Perfil
const TABS: { href: string; label: string; icon: LucideIcon; also?: string[] }[] = [
  { href: "/", label: "Inicio", icon: Home },
  { href: "/search", label: "Buscar", icon: Search, also: ["/genres"] },
  { href: "/schedule", label: "Calendario", icon: CalendarDays },
  { href: "/my-list", label: "Mi lista", icon: Bookmark },
  { href: "/account", label: "Perfil", icon: User, also: ["/settings", "/status"] },
];

function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" || pathname.startsWith("/anime/") : pathname === href || pathname.startsWith(`${href}/`);
}

export function AccountAvatar({ className }: { className?: string }) {
  const account = useAccount();
  const user = account?.signedIn ? account.user : null;
  return (
    <Link
      href="/account"
      aria-label={user ? `Tu cuenta: ${user.name}` : "Cuenta"}
      className={cn(
        "flex items-center justify-center w-10 h-10 rounded-full bg-zinc-700 text-white font-bold overflow-hidden hover:ring-2 hover:ring-white/40",
        className
      )}
    >
      {user?.image ? (
        <img src={user.image} alt="" className="w-full h-full object-cover" />
      ) : user ? (
        user.name.charAt(0).toUpperCase()
      ) : (
        <User className="w-5 h-5" />
      )}
    </Link>
  );
}

function TopSearch() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");

  // Mirrors the search page's query, so the box never shows something else. The URL holds
  // the trimmed query, so a trailing space being typed is kept
  useEffect(() => {
    const urlQuery = pathname === "/search" ? params.get("q") ?? "" : "";
    setQuery((current) => (current.trim() === urlQuery ? current : urlQuery));
  }, [pathname, params]);

  // "/" jumps to the search box from anywhere that isn't a text field
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (e.key !== "/" || e.ctrlKey || e.metaKey || e.altKey) return;
      if (target && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))) return;
      e.preventDefault();
      inputRef.current?.focus();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const go = (value: string) => {
    const q = value.trim();
    // On the search page the text joins the filters already applied
    const next = new URLSearchParams(pathname === "/search" ? params.toString() : "");
    if (q) next.set("q", q);
    else next.delete("q");
    const qs = next.toString();
    router[pathname === "/search" ? "replace" : "push"](qs ? `/search?${qs}` : "/search", { scroll: false });
  };

  return (
    <form
      role="search"
      onSubmit={(e) => {
        e.preventDefault();
        go(query);
      }}
      className="flex items-center gap-2.5 h-10 w-full max-w-[22rem] px-3.5 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-400 focus-within:border-zinc-500"
    >
      <Search className="w-[1.1rem] h-[1.1rem] flex-shrink-0" aria-hidden />
      <label htmlFor="top-search" className="sr-only">
        Buscar anime
      </label>
      <input
        ref={inputRef}
        id="top-search"
        type="search"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          // Already on the results page: they follow the typing
          if (pathname === "/search") go(e.target.value);
        }}
        placeholder="Buscar anime…"
        autoComplete="off"
        className="flex-1 min-w-0 bg-transparent text-[0.95rem] text-white placeholder:text-zinc-500 outline-none"
      />
      <kbd className="px-1.5 rounded-md border border-zinc-700 text-xs font-semibold text-zinc-400">/</kbd>
    </form>
  );
}

function TopBar() {
  const pathname = usePathname();
  return (
    <header className="hidden md:block sticky top-0 z-40 border-b border-zinc-900 bg-black/90">
      <div className="flex items-center gap-7 max-w-[1360px] mx-auto px-8 h-16">
        <Link href="/" className="flex items-center gap-2.5 font-display text-lg">
          <Hanko decorative className="w-9 h-9 text-[0.95rem]" />
          PK Anime
        </Link>
        <nav aria-label="Secciones" className="flex items-center gap-1">
          {TOP_LINKS.map((link) => {
            const active = isActive(pathname, link.href) || !!link.also?.some((path) => isActive(pathname, path));
            return (
              <Link
                key={link.href}
                href={link.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "px-3.5 py-2 rounded-full text-[0.95rem] transition-colors",
                  active ? "bg-zinc-800 text-white font-semibold" : "text-zinc-400 hover:text-white"
                )}
              >
                {link.label}
              </Link>
            );
          })}
        </nav>
        <div className="flex flex-1 items-center justify-end gap-2.5">
          {/* useSearchParams needs a boundary of its own */}
          <Suspense fallback={<div className="h-10 w-full max-w-[22rem] rounded-xl bg-zinc-900" />}>
            <TopSearch />
          </Suspense>
          <Link
            href="/settings"
            aria-label="Ajustes"
            className={cn(
              "flex items-center justify-center w-10 h-10 rounded-xl hover:bg-zinc-800",
              pathname === "/settings" ? "text-white bg-zinc-800" : "text-zinc-400"
            )}
          >
            <Settings className="w-5 h-5" />
          </Link>
          <AccountAvatar />
        </div>
      </div>
    </header>
  );
}

function TabBar() {
  const pathname = usePathname();
  return (
    <nav
      aria-label="Secciones"
      className="md:hidden fixed left-0 right-0 bottom-0 z-40 flex border-t border-zinc-800 bg-zinc-950 pb-[env(safe-area-inset-bottom)]"
    >
      {TABS.map(({ href, label, icon: Icon, also }) => {
        const active = isActive(pathname, href) || !!also?.some((path) => isActive(pathname, path));
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex flex-1 flex-col items-center justify-center gap-1 h-16 text-xs",
              active ? "text-white font-bold" : "text-zinc-400"
            )}
          >
            <Icon className="w-6 h-6" strokeWidth={active ? 2.4 : 2} aria-hidden />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}

/** Library chrome for computers and phones: top bar from md up, bottom tabs below */
export function WebShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  // The player takes the whole screen
  const fullScreen = pathname.startsWith("/watch/");

  return (
    <WebNavigationProvider>
      <div lang="es" className="min-h-screen bg-black text-white">
        {!fullScreen && <TopBar />}
        <main className={cn(!fullScreen && "pb-[calc(4rem+env(safe-area-inset-bottom))] md:pb-0")}>
          {children}
          {!fullScreen && <LibraryFooter />}
        </main>
        {!fullScreen && <TabBar />}
      </div>
    </WebNavigationProvider>
  );
}
