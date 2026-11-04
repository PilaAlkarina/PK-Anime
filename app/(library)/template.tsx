"use client";

import { usePathname } from "next/navigation";

/**
 * Remounted on every navigation (unlike the layout), so each library page fades in once it is
 * ready. Opacity only: a transform would turn this wrapper into the containing block of the
 * pages' fixed elements (TV hero, rails) for the length of the animation. The player has its own
 * entrance and skips this one.
 */
export default function LibraryTemplate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  if (pathname.startsWith("/watch/")) return <>{children}</>;
  return <div className="page-in">{children}</div>;
}
