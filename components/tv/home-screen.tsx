"use client";

import { useEffect, useRef, useState } from "react";
import { setFocus } from "@noriginmedia/norigin-spatial-navigation";
import { useRouter } from "next/navigation";
import type { CatalogItem, CatalogRow } from "@/lib/anilist/types";
import type { ContinueItem } from "@/lib/library/history";
import { hideFromContinueWatching, newEpisodesBadge, useContinueRows, type NewEpisodesItem } from "@/lib/library/continue";
import { X } from "lucide-react";
import { CardRow, usePagedRow, type RowCard } from "./catalog-row";
import { FocusButton, Screen } from "./focusable";
import { Hero } from "./hero";
import { Keycap } from "@/components/brand";
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
  const cards: RowCard[] = items.map((item, index) => ({
    item,
    badge: item.airedEpisode ? `EP ${item.airedEpisode.episode}` : undefined,
    rank: row.kind === "trending" ? index + 1 : undefined,
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
      <Keycap className="mr-2">{keyLabel}</Keycap>
      {children}
    </span>
  );
}

/** What the remote's keys do here, for whoever picks it up for the first time */
function RemoteHints() {
  return (
    <div className="fixed top-[4vh] right-[3rem] z-30 flex items-center px-5 py-2 rounded-full bg-zinc-900/90 border border-line text-lg text-zinc-200">
      <KeyHint keyLabel="◀ ▶ ▲ ▼">Moverse</KeyHint>
      <KeyHint keyLabel="OK">Abrir</KeyHint>
    </div>
  );
}

export function HomeScreen({ rows }: { rows: CatalogRow[] }) {
  const router = useRouter();
  // Initial focus waits for the stored history, so it lands on "Seguir viendo" when there is one
  const mounted = useMounted();
  // The watch history merged with what both lists are watching; caught-up shows with a new
  // episode out go to their own row, under it
  const { newEpisodes, resume } = useContinueRows();
  // That row waits for current data from AniList. With nothing to resume, the first focus went
  // to the catalog by then: it takes the focus, unless the remote was already used.
  const touchedRef = useRef(false);
  useEffect(() => {
    const onKey = () => (touchedRef.current = true);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  const firstNewId = newEpisodes[0]?.anime.id;
  const hasResume = resume.length > 0;
  useEffect(() => {
    if (mounted && firstNewId && !hasResume && !touchedRef.current) setFocus(`new-episodes:${firstNewId}`);
  }, [mounted, firstNewId, hasResume]);
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

  // The hero wears the "TENDENCIA N.º …" stamp while it shows a title from the trending row
  const heroRank = hero && rows[0].kind === "trending" ? rows[0].items.findIndex((i) => i.id === hero.id) + 1 : 0;

  // Taking a card off moves the focus to its neighbour, or to the next row when it was the last
  const hide = (rowKey: string, items: ContinueItem[], index: number, nextRow: string) => {
    const neighbour = items[index + 1] ?? items[index - 1];
    hideFromContinueWatching(items[index].anime.id);
    setTimeout(() => setFocus(neighbour ? `${rowKey}:${neighbour.anime.id}` : nextRow));
  };

  const toCard = (
    { anime, episode, progress }: ContinueItem,
    onHide: () => void
  ): RowCard => ({
    item: anime,
    key: `${anime.id}`,
    progress,
    episode,
    wide: {
      title: anime.title,
      meta: progress > 0 ? `Episodio ${episode} · visto el ${Math.round(progress * 100)} %` : `Episodio ${episode}`,
    },
    onSelect: () => router.push(`/watch/${anime.id}/${episode}`),
    // OK plays; Down reaches these, for the episode list, the trailer or the list status
    actions: [
      { label: "Ver ficha", onSelect: () => router.push(`/anime/${anime.id}`) },
      { label: "Quitar", icon: X, onSelect: onHide },
    ],
  });
  const firstRow = `row:${rows[0].id}`;
  const newCards: RowCard[] = newEpisodes.map((item: NewEpisodesItem, index) => ({
    ...toCard(item, () => hide("new-episodes", newEpisodes, index, firstRow)),
    badge: newEpisodesBadge(item.newCount),
    badgeClassName: "bg-red-500 text-black",
  }));
  const resumeCards = resume.map((item, index) =>
    toCard(item, () => hide("continue", resume, index, newEpisodes.length ? "row:new-episodes" : firstRow))
  );

  return (
    <Screen ready={mounted}>
      <Hero item={hero} rank={heroRank} />
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
        {newCards.length > 0 && (
          <CardRow
            rowKey="new-episodes"
            title="Nuevos episodios"
            cards={newCards}
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
