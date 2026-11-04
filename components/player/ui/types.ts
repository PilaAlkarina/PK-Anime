export interface SkipRange {
  start: number;
  end: number;
}

/** What the library knows about the next episode; the embed alone never has it */
export interface NextEpisodeInfo {
  number: number;
  title?: string | null;
  thumbnail?: string | null;
  /** Minutes */
  duration?: number | null;
}

/** "1,3 s": decimals the Spanish way */
export function formatSeconds(ms: number) {
  return `${(ms / 1000).toLocaleString("es-ES", { maximumFractionDigits: 1 })} s`;
}
