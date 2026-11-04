import type { CatalogItem, MediaStatus } from "@/lib/anilist/types";

const FORMAT_LABELS: Record<string, string> = {
  TV: "Serie",
  TV_SHORT: "Serie corta",
  MOVIE: "Película",
  SPECIAL: "Especial",
  OVA: "OVA",
  ONA: "ONA",
  MUSIC: "Musical",
};

const STATUS_LABELS: Record<MediaStatus, string> = {
  FINISHED: "Finalizado",
  RELEASING: "En emisión",
  NOT_YET_RELEASED: "Próximamente",
  CANCELLED: "Cancelado",
  HIATUS: "En pausa",
};

export function formatLabel(format: string | null) {
  return format ? FORMAT_LABELS[format] || format : null;
}

export function statusLabel(status: MediaStatus | null) {
  return status ? STATUS_LABELS[status] : null;
}

export function episodesLabel(item: Pick<CatalogItem, "status" | "episodes" | "availableEpisodes">) {
  if (item.status === "NOT_YET_RELEASED") return "Próximamente";
  if (item.status === "RELEASING" && item.availableEpisodes) {
    return item.episodes
      ? `${item.availableEpisodes} de ${item.episodes} episodios`
      : `${item.availableEpisodes} episodios`;
  }
  const total = item.episodes ?? item.availableEpisodes;
  if (!total) return null;
  return total === 1 ? "1 episodio" : `${total} episodios`;
}

/**
 * "Serie · 2026 · 12 episodios · 86%". Pass `score: false` where the score is drawn apart
 * (ScoreStar in components/brand.tsx)
 */
export function metaLine(item: CatalogItem, { score = true }: { score?: boolean } = {}) {
  return [
    formatLabel(item.format),
    item.seasonYear,
    episodesLabel(item),
    score && item.score ? `${item.score}%` : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

/** AniList's 0–100 average as a mark out of ten, Spanish style: 86 → "8,6" */
export function scoreOutOfTen(score: number) {
  return (score / 10).toFixed(1).replace(".", ",");
}

const weekday = new Intl.DateTimeFormat("es", { weekday: "long" });
const time = new Intl.DateTimeFormat("es", { hour: "2-digit", minute: "2-digit" });
const dayMonth = new Intl.DateTimeFormat("es", { day: "numeric", month: "long" });

export function formatTime(unixSeconds: number) {
  return time.format(new Date(unixSeconds * 1000));
}

/** "hoy a las 18:30", "el jueves a las 18:30", "el 12 de diciembre" */
export function airingLabel(unixSeconds: number, now = new Date()) {
  const date = new Date(unixSeconds * 1000);
  const days = Math.round((startOfDay(date) - startOfDay(now)) / 86_400_000);
  if (days === 0) return `hoy a las ${formatTime(unixSeconds)}`;
  if (days === 1) return `mañana a las ${formatTime(unixSeconds)}`;
  if (days > 1 && days < 7) return `el ${weekday.format(date)} a las ${formatTime(unixSeconds)}`;
  return `el ${dayMonth.format(date)}`;
}

export function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

/**
 * When an episode not out yet airs: "Mañana · 14:00", "Domingo · 14:00", "15 nov. · 14:00".
 * Without an exact time only the day. Past its time (the schedule lags a little): "Pendiente".
 */
const shortDay = new Intl.DateTimeFormat("es", { day: "numeric", month: "short" });

export function upcomingLabel(airingAt: number | null, exactTime: boolean, now = new Date()) {
  if (airingAt === null) return "Sin fecha";
  const date = new Date(airingAt * 1000);
  if (exactTime && date.getTime() <= now.getTime()) return "Pendiente";
  const days = Math.round((startOfDay(date) - startOfDay(now)) / 86_400_000);
  if (days < 0) return "Pendiente";
  const day =
    days === 0 ? "Hoy" : days === 1 ? "Mañana" : days < 7 ? capitalize(weekday.format(date)) : shortDay.format(date);
  return exactTime ? `${day} · ${formatTime(airingAt)}` : day;
}

const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);
