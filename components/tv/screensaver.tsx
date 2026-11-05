"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { Hanko } from "@/components/brand";
import { useMyList } from "@/lib/library/my-list";
import { mergeMyList, REMOTE_STATUS_LABELS, useRemoteLibrary, type MyListItem } from "@/lib/library/remote";
import { useScreensaverMinutes } from "@/lib/tv/screensaver";
import { ScorePill } from "./list-styles";
import { cn } from "@/lib/utils";

const CHECK_MS = 10_000;
const SLIDE_MS = 12_000;
const MAX_SLIDES = 40;

const time = () => new Date().toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });

/** Something is playing (an episode, a trailer, an opening): no screensaver then */
function playing() {
  return Array.from(document.querySelectorAll("video")).some((v) => !v.paused && !v.ended);
}

/** Shuffled with the best scored a little more likely to come first */
function slidesFrom(items: MyListItem[]) {
  return items
    .filter(({ item }) => item.banner || item.cover)
    .map((i) => ({ i, weight: Math.random() + (i.entry?.score ?? 5) / 10 }))
    .sort((a, b) => b.weight - a.weight)
    .slice(0, MAX_SLIDES)
    .map(({ i }) => i);
}

/**
 * TV screensaver: after a few minutes without the remote (Ajustes sets how many, or turns it
 * off), a slow show of the list's artwork with each anime's title and the viewer's score, and the
 * time. Never over the player or anything playing. Any key or movement closes it, and that key
 * does nothing else. The text changes sides every slide, so nothing stays burnt in one place.
 */
export function TvScreensaver() {
  const minutes = useScreensaverMinutes();
  const pathname = usePathname();
  const list = useMyList();
  const remote = useRemoteLibrary();
  const [active, setActive] = useState(false);
  const activeRef = useRef(false);
  activeRef.current = active;
  const lastActivity = useRef(Date.now());

  // Activity: anything the remote, a phone or a mouse does
  useEffect(() => {
    const onActivity = (e: Event) => {
      lastActivity.current = Date.now();
      if (!activeRef.current) return;
      // The key that wakes the TV does nothing else
      e.preventDefault();
      e.stopImmediatePropagation();
      setActive(false);
    };
    const events = ["keydown", "mousedown", "wheel", "touchstart"];
    events.forEach((name) => window.addEventListener(name, onActivity, true));
    const onMove = (e: MouseEvent) => (e.movementX || e.movementY) && onActivity(e);
    window.addEventListener("mousemove", onMove, true);
    return () => {
      events.forEach((name) => window.removeEventListener(name, onActivity, true));
      window.removeEventListener("mousemove", onMove, true);
    };
  }, []);

  useEffect(() => {
    if (!minutes) return;
    const timer = setInterval(() => {
      if (activeRef.current || pathname.startsWith("/watch") || playing()) {
        if (!activeRef.current) lastActivity.current = Date.now();
        return;
      }
      if (Date.now() - lastActivity.current >= minutes * 60_000) setActive(true);
    }, CHECK_MS);
    return () => clearInterval(timer);
  }, [minutes, pathname]);

  if (!active) return null;
  return <Slideshow items={mergeMyList(list, remote)} />;
}

function Slideshow({ items }: { items: MyListItem[] }) {
  const slides = useMemo(() => slidesFrom(items), [items]);
  const [index, setIndex] = useState(0);
  const [clock, setClock] = useState(time);

  useEffect(() => {
    if (slides.length < 2) return;
    const timer = setInterval(() => setIndex((i) => (i + 1) % slides.length), SLIDE_MS);
    return () => clearInterval(timer);
  }, [slides.length]);

  useEffect(() => {
    const timer = setInterval(() => setClock(time()), 15_000);
    return () => clearInterval(timer);
  }, []);

  const current = slides[index];
  const right = index % 2 === 1;

  return (
    <div className="fixed top-0 left-0 z-[90] w-screen h-screen bg-black text-white overflow-hidden tv-fade-in" aria-hidden>
      {slides.map(({ item }, i) => {
        // Only the current slide and its neighbours stay mounted, so a long list doesn't load every image
        const near = i === index || i === (index + 1) % slides.length || i === (index - 1 + slides.length) % slides.length;
        if (!near) return null;
        return (
          <img
            key={item.id}
            src={item.banner || item.cover || ""}
            alt=""
            className={cn(
              "absolute top-0 left-0 w-full h-full object-cover transition-opacity duration-[1500ms] ease-in-out",
              i === index ? "opacity-100 pk-saver-pan" : "opacity-0",
              !item.banner && "object-contain"
            )}
          />
        );
      })}
      <div className="absolute top-0 left-0 w-full h-full bg-gradient-to-t from-black/85 via-black/20 to-black/40" />

      <div className="absolute top-[5vh] right-[4vw] flex items-center">
        <span className="mr-5 text-5xl font-bold tabular-nums text-white/90">{clock}</span>
        <Hanko decorative className="w-14 h-14 text-xl opacity-80" />
      </div>

      {current ? (
        <div
          key={current.item.id}
          className={cn("absolute bottom-[8vh] max-w-[60vw] tv-fade-in", right ? "right-[5vw] text-right" : "left-[5vw]")}
        >
          <p className="font-display text-6xl leading-tight line-clamp-2 drop-shadow-lg">{current.item.title}</p>
          <p className={cn("flex items-center mt-4 text-2xl text-zinc-200", right && "justify-end")}>
            {current.entry && <span>{REMOTE_STATUS_LABELS[current.entry.status]}</span>}
            {current.entry?.score ? <ScorePill score={current.entry.score} inline className="ml-4 px-3 py-1.5 text-2xl" /> : null}
          </p>
        </div>
      ) : (
        <p className="absolute bottom-[8vh] left-[5vw] text-3xl text-zinc-400">Pulsa cualquier botón para seguir</p>
      )}
    </div>
  );
}
