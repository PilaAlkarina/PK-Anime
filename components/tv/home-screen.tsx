"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { CatalogItem, CatalogRow } from "@/lib/anilist/types";
import { continueWatching, useWatchHistory } from "@/lib/library/history";
import { useMyList } from "@/lib/library/my-list";
import { mergeContinueWatching, useRemoteLibrary } from "@/lib/library/remote";
import { CardRow, usePagedRow, type RowCard } from "./catalog-row";
import { FocusButton, Screen } from "./focusable";
import { Hero } from "./hero";
import { useMounted } from "./page-frame";
import { LibraryFooter } from "@/components/library-footer";
import { scrollToPosition } from "@/lib/tv/scroll";

// Waits this long after focus settles before swapping the hero artwork, so holding an
// arrow down doesn't download every banner on the way
const HERO_DELAY_MS = 150;

function PagedRow({
  row,
  onCardFocus,
  onRowFocus,
}: {
  row: CatalogRow;
  onCardFocus: (item: CatalogItem) => void;
  onRowFocus: (node: HTMLElement) => void;
}) {
  const router = useRouter();
  const { items, loadMore } = usePagedRow(row);
  const cards: RowCard[] = items.map((item) => ({
    item,
    badge: item.airedEpisode ? `EP ${item.airedEpisode.episode}` : undefined,
    onSelect: () => router.push(`/anime/${item.id}`),
  }));

  return (
    <CardRow
      rowKey={row.id}
      title={row.title}
      cards={cards}
      onCardFocus={onCardFocus}
      onRowFocus={onRowFocus}
      onNearEnd={loadMore}
    />
  );
}

function KeyHint({ keyLabel, children }: { keyLabel: string; children: React.ReactNode }) {
  return (
    <span className="flex items-center ml-6 first:ml-0">
      <span className="mr-2 px-2.5 rounded-lg border-2 border-zinc-500 font-bold leading-relaxed">{keyLabel}</span>
      {children}
    </span>
  );
}

/** What the remote's keys do here, for whoever picks it up for the first time */
function RemoteHints() {
  return (
    <div className="fixed top-[4vh] right-[3rem] z-30 flex items-center px-5 py-2 rounded-full bg-black/80 text-lg text-zinc-200">
      <KeyHint keyLabel="◀ ▶ ▲ ▼">Moverse</KeyHint>
      <KeyHint keyLabel="OK">Abrir</KeyHint>
    </div>
  );
}

export function HomeScreen({ rows }: { rows: CatalogRow[] }) {
  const router = useRouter();
  // Initial focus waits for the stored history, so it lands on "Seguir viendo" when there is one
  const mounted = useMounted();
  const history = useWatchHistory();
  const remote = useRemoteLibrary();
  const myList = useMyList();
  // The watch history merged with what both lists are watching
  const resume = useMemo(
    () => mergeContinueWatching(continueWatching(history), remote, myList),
    [history, remote, myList]
  );
  const [hero, setHero] = useState<CatalogItem | null>(rows[0]?.items[0] ?? null);
  const heroTimer = useRef<ReturnType<typeof setTimeout>>();
  const listRef = useRef<HTMLDivElement>(null);

  const showInHero = (item: CatalogItem) => {
    clearTimeout(heroTimer.current);
    heroTimer.current = setTimeout(() => setHero(item), HERO_DELAY_MS);
  };

  // The focused row slides up to the top of the list area, under the hero
  const scrollToRow = (node: HTMLElement) => scrollToPosition(listRef.current, { top: node.offsetTop });

  if (rows.length === 0) {
    return (
      <Screen className="flex flex-col items-start justify-center min-h-screen pl-12">
        <h1 className="text-4xl font-bold">No se pudo cargar el catálogo</h1>
        <p className="mt-3 text-xl text-zinc-400">AniList no responde. Vuelve a intentarlo en unos segundos.</p>
        <FocusButton variant="primary" className="mt-8" onSelect={() => router.refresh()}>
          Reintentar
        </FocusButton>
      </Screen>
    );
  }

  const resumeCards: RowCard[] = resume.map(({ anime, episode, progress }) => ({
    item: anime,
    key: `${anime.id}`,
    progress,
    wide: {
      title: anime.title,
      meta: progress > 0 ? `Episodio ${episode} · visto el ${Math.round(progress * 100)} %` : `Episodio ${episode}`,
    },
    onSelect: () => router.push(`/watch/${anime.id}/${episode}`),
  }));

  return (
    <Screen ready={mounted}>
      <Hero item={hero} />
      <RemoteHints />
      <div
        ref={listRef}
        className="fixed left-[7rem] right-0 bottom-0 top-[50vh] overflow-y-auto overflow-x-hidden tv-no-scrollbar"
      >
        {resumeCards.length > 0 && (
          <CardRow
            rowKey="continue"
            title="Seguir viendo"
            cards={resumeCards}
            onCardFocus={showInHero}
            onRowFocus={scrollToRow}
          />
        )}
        {rows.map((row) => (
          <PagedRow key={row.id} row={row} onCardFocus={showInHero} onRowFocus={scrollToRow} />
        ))}
        <div className="px-12">
          <LibraryFooter onFocus={scrollToRow} />
        </div>
        {/* Lets the last row scroll up to the top of the list area */}
        <div className="h-[30vh]" />
      </div>
    </Screen>
  );
}
