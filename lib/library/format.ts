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

/** "Serie · 2026 · 12 episodios · 86%" */
export function metaLine(item: CatalogItem) {
  return [
    formatLabel(item.format),
    item.seasonYear,
    episodesLabel(item),
    item.score ? `${item.score}%` : null,
  ]
    .filter(Boolean)
    .join(" · ");
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
