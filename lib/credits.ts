/**
 * Copyright holders and third-party credits, shown in the library footer and on /license.
 * The MIT license asks for the original copyright notice to stay with every copy.
 */

export const LICENSE_NAME = "MIT";

export const COPYRIGHTS = [
  { year: 2026, holder: "AniFlow", role: "código original", url: "https://github.com/realmichaelstetson/AniFlow-API" },
  { year: 2026, holder: "PilaAlkarina", role: "PK Anime", url: null },
] as const;

export const THIRD_PARTY = [
  {
    name: "AniList",
    url: "https://anilist.co",
    credit: "Catálogo, imágenes y listas de",
    note: "Catálogo, portadas, banners y calendario de emisión, a través de su API pública, y sincronización de la lista del usuario.",
  },
  {
    name: "MyAnimeList",
    url: "https://myanimelist.net",
    credit: "listas de",
    note: "Sincronización de la lista del usuario. MyAnimeList es una marca de sus propietarios.",
  },
] as const;

export const DISCLAIMER =
  "PK Anime no está afiliado a AniList ni a MyAnimeList. No aloja vídeos: los episodios se obtienen en el momento de fuentes de terceros.";
