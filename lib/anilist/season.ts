import type { MediaSeason } from "./types";

const SEASONS: MediaSeason[] = ["WINTER", "SPRING", "SUMMER", "FALL"];

export const SEASON_LABELS: Record<MediaSeason, string> = {
  WINTER: "Invierno",
  SPRING: "Primavera",
  SUMMER: "Verano",
  FALL: "Otoño",
};

/** Anime seasons follow calendar quarters: Winter starts in January, Fall in October */
export function getCurrentSeason(date = new Date()): { season: MediaSeason; year: number } {
  return { season: SEASONS[Math.floor(date.getUTCMonth() / 3)], year: date.getUTCFullYear() };
}

export function getNextSeason(date = new Date()): { season: MediaSeason; year: number } {
  const { season, year } = getCurrentSeason(date);
  const index = SEASONS.indexOf(season);
  return index === SEASONS.length - 1
    ? { season: SEASONS[0], year: year + 1 }
    : { season: SEASONS[index + 1], year };
}

export function seasonLabel(season: MediaSeason, year: number) {
  return `${SEASON_LABELS[season]} ${year}`;
}
