"use client";

import React from "react";
import { useSearchParams } from "next/navigation";
import { EmbedPlayer } from "./embed-player";

export interface EmbedPageClientProps {
  anilistId?: number | null;
  malId?: number | null;
  episodeNumber: number;
  audio?: "sub" | "dub";
  ticket?: string | null;
}

export function EmbedPageClient({
  anilistId: propAnilistId,
  malId: propMalId,
  episodeNumber: propEpisode,
  audio: propAudio,
  ticket: propTicket,
}: EmbedPageClientProps) {
  const searchParams = useSearchParams();

  // Query parameter overrides
  let server = searchParams.get("server") || "flow";
  const startAtRaw = searchParams.get("startAt") || searchParams.get("progress") || "0";
  const startAt = parseFloat(startAtRaw) || 0;
  const parentHost = searchParams.get("parentHost") || null;

  // autoskipIntro / skipIntro and autoskipOutro / skipOutro: 1 on, 0 off. Without them the
  // viewer's saved preference applies (on until they change it)
  const flag = (value: string | null) =>
    value === null ? undefined : !(value === "0" || value === "off" || value === "false");
  const autoskipIntro = flag(searchParams.get("autoskipIntro") ?? searchParams.get("skipIntro"));
  const autoskipOutro = flag(searchParams.get("autoskipOutro") ?? searchParams.get("skipOutro"));

  // Check query audio override if present
  const queryAudio = searchParams.get("audio");
  const effectiveAudio = (queryAudio === "dub" || propAudio === "dub" ? "dub" : "sub") as "sub" | "dub";

  if (effectiveAudio === "dub" && (server === "zuri" || server === "zuna")) {
    server = "flow";
  }

  const effectiveAnilistId = propAnilistId
    ? propAnilistId
    : searchParams.get("anilistId")
    ? parseInt(searchParams.get("anilistId")!, 10)
    : null;

  const effectiveMalId = propMalId
    ? propMalId
    : searchParams.get("malId")
    ? parseInt(searchParams.get("malId")!, 10)
    : null;

  const effectiveEpisode = propEpisode
    ? propEpisode
    : searchParams.get("episode")
    ? parseInt(searchParams.get("episode")!, 10)
    : 1;

  return (
    <main className="fixed inset-0 w-full h-full bg-black overflow-hidden m-0 p-0">
      <EmbedPlayer
        anilistId={effectiveAnilistId}
        malId={effectiveMalId}
        episodeNumber={effectiveEpisode}
        initialAudio={effectiveAudio}
        initialServer={server}
        autoSelectServer={!searchParams.get("server")}
        startAt={startAt}
        autoskipIntro={autoskipIntro}
        autoskipOutro={autoskipOutro}
        parentHost={parentHost}
      />
    </main>
  );
}
