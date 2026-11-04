import { cn } from "@/lib/utils";

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
        "shadow-[inset_0_0_0_0.15em_rgb(var(--c-ink)/0.18)]",
        className
      )}
    >
      PK
    </span>
  );
}

const SECTIONS: [RegExp, string][] = [
  [/^seguir viendo/i, "続きから"],
  [/^tendencias/i, "人気"],
  [/^temporada de/i, "今期"],
  [/^próxima temporada/i, "来期"],
  [/^mejor valorados/i, "高評価"],
  [/^en emisión/i, "放送中"],
  [/^próximos estrenos/i, "近日公開"],
  [/^últimos episodios/i, "最新話"],
  [/^episodios/i, "エピソード"],
  [/^relacionados/i, "関連作品"],
  [/^recomenda/i, "おすすめ"],
  [/^información/i, "作品情報"],
  [/^mi lista/i, "マイリスト"],
  [/^calendario/i, "放送予定"],
  [/^ajustes/i, "設定"],
  [/^buscar|^búsqueda/i, "検索"],
  [/^géneros/i, "ジャンル"],
  [/^cuenta/i, "アカウント"],
  [/^estado/i, "ステータス"],
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
      className={cn("ml-[0.6em] font-sans text-[0.55em] font-medium tracking-[0.2em] text-zinc-400 align-middle", className)}
    >
      {word}
    </span>
  );
}

/** Kicker label stamped like a seal: "EN PAUSA", "TENDENCIA N.º 1"… */
export function Stamp({
  children,
  japanese,
  muted = false,
  className,
}: {
  children: React.ReactNode;
  japanese?: string;
  muted?: boolean;
  className?: string;
}) {
  return (
    <span className={cn("inline-flex items-center gap-[0.8em] self-start", className)}>
      <span
        className={cn(
          "inline-flex px-[0.6em] py-[0.15em] rounded-md border-2 font-black tracking-[0.14em] -rotate-2",
          muted ? "border-zinc-400 text-zinc-400" : "border-red-500 text-red-500"
        )}
      >
        {children}
      </span>
      {japanese && (
        <span lang="ja" aria-hidden="true" className="font-medium tracking-[0.2em] text-zinc-400">
          {japanese}
        </span>
      )}
    </span>
  );
}
