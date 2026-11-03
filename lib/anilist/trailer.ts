// Shared by the server catalog and client components, so it must stay free of server imports

export interface Trailer {
  id: string;
  site: string;
}

// Video IDs are short tokens; anything else (AniList sometimes adds stray whitespace) is
// cleaned or refused before it reaches an embed URL
const VIDEO_ID = /^[\w-]{4,40}$/;

export function cleanTrailer(trailer: { id: string | null; site: string | null } | null | undefined): Trailer | null {
  const id = trailer?.id?.trim();
  const site = trailer?.site?.trim().toLowerCase();
  if (!id || !site || !VIDEO_ID.test(id)) return null;
  return site === "youtube" || site === "dailymotion" ? { id, site } : null;
}

/** Player URL for the trailer, autoplaying; null for sites we can't embed */
export function trailerEmbedUrl(trailer: Trailer | null | undefined, origin?: string): string | null {
  const clean = cleanTrailer(trailer);
  if (!clean) return null;
  if (clean.site === "dailymotion") {
    return `https://www.dailymotion.com/embed/video/${clean.id}?autoplay=1&queue-enable=false`;
  }
  // enablejsapi lets the TV page send play/pause without handing focus to the player
  const params = new URLSearchParams({ autoplay: "1", rel: "0", playsinline: "1", enablejsapi: "1" });
  if (origin) params.set("origin", origin);
  return `https://www.youtube-nocookie.com/embed/${clean.id}?${params}`;
}
