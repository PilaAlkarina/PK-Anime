import { Fragment } from "react";
import { cn } from "@/lib/utils";
import { scoreOutOfTen } from "@/lib/library/format";
import { ScoreStarIcon } from "@/components/icons";

/**
 * Brand pieces of the «Tinta y sello» identity. Colors come from the active theme, so they
 * follow the picker in Ajustes.
 */

/** "PK" as a hanko seal: an accent square, slightly turned, like a stamp on paper */
export function Hanko({ className, decorative = false }: { className?: string; decorative?: boolean }) {
  return (
    <span
      role={decorative ? undefined : "img"}
      aria-label={decorative ? undefined : "PK Anime"}
      aria-hidden={decorative || undefined}
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-[22%] bg-red-500 text-black font-display -rotate-6",
        "shadow-[inset_0_0_0_0.15em_rgba(var(--c-ink),0.18)]",
        className
      )}
    >
      PK
    </span>
  );
}

const SECTIONS: [RegExp, string][] = [
  [/^seguir viendo/i, "続きから"],
  [/^nuevos episodios/i, "新着"],
  [/^porque viste/i, "おすすめ"],
  [/^orden de visionado/i, "視聴順"],
  [/^estadísticas/i, "統計"],
  [/^openings/i, "主題歌"],
  [/^radio/i, "ラジオ"],
  [/^biblioteca/i, "ライブラリ"],
  [/^ver juntos/i, "一緒に見る"],
  [/^tendencias/i, "人気"],
  [/^temporada de/i, "今期"],
  [/^próxima temporada/i, "来期"],
  [/^mejor valorados/i, "高評価"],
  [/^en emisión/i, "放送中"],
  [/^hoy en emisión/i, "今日の放送"],
  [/^próximos estrenos/i, "近日公開"],
  [/^últimos episodios/i, "最新話"],
  [/^episodios/i, "エピソード"],
  [/^relacionados/i, "関連作品"],
  [/^recomenda/i, "おすすめ"],
  [/^información/i, "作品情報"],
  [/^mi lista/i, "マイリスト"],
  [/^calendario/i, "放送予定"],
  [/^ajustes/i, "設定"],
  [/^mando del móvil/i, "リモコン"],
  [/^búsquedas recientes/i, "最近の検索"],
  [/^buscar|^búsqueda/i, "検索"],
  [/^explorar por género/i, "ジャンル"],
  [/^géneros/i, "ジャンル"],
  [/^cuenta/i, "アカウント"],
  [/^estado/i, "ステータス"],
  [/^servidor/i, "サーバー"],
  [/^subtítulos/i, "字幕"],
  [/^acción$/i, "アクション"],
  [/^aventura$/i, "冒険"],
  [/^comedia$/i, "コメディ"],
  [/^drama$/i, "ドラマ"],
  [/^fantasía$/i, "ファンタジー"],
  [/^romance$/i, "恋愛"],
  [/^terror$/i, "ホラー"],
  [/^misterio$/i, "ミステリー"],
  [/^ciencia ficción$/i, "SF"],
  [/^deportes$/i, "スポーツ"],
  [/^música$/i, "音楽"],
  [/^sobrenatural$/i, "超常"],
  [/^suspense$/i, "サスペンス"],
  [/^recuentos de la vida$/i, "日常"],
  [/^mecha$/i, "メカ"],
  [/^psicológico$/i, "サイコ"],
];

/** The Japanese word shown beside a section title, when there is one */
export function japaneseFor(title: string): string | null {
  return SECTIONS.find(([pattern]) => pattern.test(title.trim()))?.[1] ?? null;
}

/**
 * Decorative Japanese label next to a section title (hidden from screen readers: the Spanish
 * title already says it). Renders nothing for titles without one.
 */
export function JapaneseLabel({ title, className }: { title: string; className?: string }) {
  const word = japaneseFor(title);
  if (!word) return null;
  return (
    <span
      lang="ja"
      aria-hidden="true"
      className={cn("ml-[0.6em] font-sans text-[0.55em] font-medium tracking-[0.2em] text-zinc-400 align-baseline", className)}
    >
      {word}
    </span>
  );
}

/**
 * Kicker label stamped like a seal: "EN PAUSA", "TENDENCIA N.º 1"… `backed` puts both words on
 * an ink backing, for stamps laid over artwork
 */
export function Stamp({
  children,
  japanese,
  muted = false,
  backed = false,
  className,
}: {
  children: React.ReactNode;
  japanese?: string;
  muted?: boolean;
  backed?: boolean;
  className?: string;
}) {
  return (
    <span className={cn("inline-flex items-center gap-[0.9em] self-start", className)}>
      <span
        className={cn(
          "inline-flex px-[0.75em] py-[0.3em] rounded-md border-2 font-black tracking-[0.14em] -rotate-2",
          muted ? "border-zinc-400 text-zinc-400" : "border-red-500 text-red-500",
          backed && "bg-black/85"
        )}
      >
        {children}
      </span>
      {japanese && (
        <span
          lang="ja"
          aria-hidden="true"
          className={cn("font-medium tracking-[0.2em] text-zinc-400", backed && "px-[0.5em] py-[0.15em] rounded-md bg-black/85")}
        >
          {japanese}
        </span>
      )}
    </span>
  );
}

/** Remote or keyboard key drawn as a keycap, with a thicker bottom edge */
export function Keycap({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center px-[0.6em] rounded-md border-[1.5px] border-b-[3px] border-zinc-500 font-black leading-relaxed",
        className
      )}
    >
      {children}
    </span>
  );
}

/** Star and "8,6" in the second accent; AniList's 0–100 average shown out of ten */
export function ScoreStar({ score, className }: { score: number; className?: string }) {
  return (
    <span className={cn("whitespace-nowrap text-accent2", className)}>
      <span className="sr-only">Puntuación </span>
      <ScoreStarIcon className="mr-[0.25em]" />
      {scoreOutOfTen(score)}
    </span>
  );
}

/** A meta line with the score as a ScoreStar: "Serie · 2023 · 28 episodios · (star) 9,1 · Aventura" */
export function MetaWithScore({
  before,
  score,
  after,
}: {
  before?: string | null;
  score?: number | null;
  after?: string | null;
}) {
  const parts = [before || null, score ? <ScoreStar key="score" score={score} /> : null, after || null].filter(Boolean);
  return (
    <>
      {parts.map((part, i) => (
        <Fragment key={i}>
          {i > 0 && " · "}
          {part}
        </Fragment>
      ))}
    </>
  );
}

const pad = (n: number) => String(n).padStart(2, "0");

/**
 * Episode number in the display face over a tile or card: outlined in paper, filled with the
 * accent for the current (or focused) one. Decorative: the card's text already names the episode.
 * Position and size come from `className`; `outline` picks the stroke (text-outline-* classes).
 */
export function EpisodeNumeral({
  n,
  current = false,
  outline = "text-outline-thin",
  className,
}: {
  n: number;
  current?: boolean;
  outline?: string;
  className?: string;
}) {
  return (
    <span
      aria-hidden="true"
      className={cn("absolute font-display leading-none pointer-events-none select-none", current ? "text-red-500" : outline, className)}
    >
      {pad(n)}
    </span>
  );
}

/**
 * Trending rank overlapping a poster's bottom-left corner: outlined with an offset accent
 * ghost, filled with the accent when focused. `size` sets stroke and ghost offset; position
 * and font size come from `className`.
 */
export function RankNumeral({
  rank,
  current = false,
  size = "web",
  className,
}: {
  rank: number;
  current?: boolean;
  /** tv: 2.5px stroke, 6px ghost; web: 1.5px / 3px on phones, 2px / 4px from md */
  size?: "tv" | "web";
  className?: string;
}) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "absolute font-display leading-none pointer-events-none select-none",
        current
          ? "text-red-500"
          : size === "tv"
            ? "text-outline-thick [text-shadow:6px_6px_0_rgba(var(--c-accent),0.55)]"
            : "text-outline-thin [text-shadow:3px_3px_0_rgba(var(--c-accent),0.55)] md:text-outline md:[text-shadow:4px_4px_0_rgba(var(--c-accent),0.55)]",
        className
      )}
    >
      {rank}
    </span>
  );
}
