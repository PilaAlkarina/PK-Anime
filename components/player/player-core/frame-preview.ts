"use client";

import Hls from "hls.js";
import { useCallback, useEffect, useRef, useState } from "react";
import type React from "react";

/** Frames are taken every this many seconds of the episode, and kept */
const STEP = 2;
/** Frames kept per stream (about 10 KB each) */
const MAX_FRAMES = 300;
/** Canvas width of a frame: shown at half, so it stays sharp on 2x screens */
const FRAME_WIDTH = 320;
/** A seek that doesn't finish by then is given up, so the queue never sticks */
const SEEK_TIMEOUT = 5000;

export interface PreviewFrame {
  /** Episode time the frame shows */
  time: number;
  /** JPEG data URL */
  src: string;
}

interface Grabber {
  video: HTMLVideoElement;
  hls: Hls | null;
  canvas: HTMLCanvasElement;
  ready: boolean;
  busy: boolean;
  /** The time asked last while a seek was running */
  pending: number | null;
  cache: Map<number, string>;
  timer: ReturnType<typeof setTimeout> | null;
}

const within = (ranges: TimeRanges | undefined, t: number) => {
  if (!ranges) return false;
  for (let i = 0; i < ranges.length; i++) {
    if (t >= ranges.start(i) - 0.25 && t <= ranges.end(i) + 0.25) return true;
  }
  return false;
};

/**
 * Frames for the seek bar's hover and drag, from the part of the episode already loaded or
 * watched. A second, muted and detached video loads the same stream at the quality the player is
 * using, so the segments it seeks to come from the browser's cache (the proxy serves them as
 * immutable) instead of the network; it jumps to the time asked, and the frame is drawn into a
 * small JPEG. Times outside what's loaded or watched get no frame: the bar shows only the time.
 */
export function useFramePreview({
  videoRef,
  hlsRef,
  streamUrl,
  enabled,
}: {
  videoRef: React.RefObject<HTMLVideoElement>;
  hlsRef: React.MutableRefObject<Hls | null>;
  streamUrl: string | null;
  enabled: boolean;
}) {
  const [frame, setFrame] = useState<PreviewFrame | null>(null);
  const grabberRef = useRef<Grabber | null>(null);
  const wantedRef = useRef<number | null>(null);
  const failedRef = useRef(false);

  const destroy = useCallback(() => {
    const g = grabberRef.current;
    grabberRef.current = null;
    if (!g) return;
    if (g.timer) clearTimeout(g.timer);
    g.hls?.destroy();
    g.video.removeAttribute("src");
    g.video.load();
  }, []);

  // A new stream (another server, audio or episode) starts over
  useEffect(() => {
    failedRef.current = false;
    setFrame(null);
    return destroy;
  }, [streamUrl, destroy]);

  const pump = useCallback(() => {
    const g = grabberRef.current;
    if (!g || !g.ready || g.busy || g.pending === null) return;
    const time = g.pending;
    g.pending = null;
    if (g.cache.has(time)) {
      if (wantedRef.current === time) setFrame({ time, src: g.cache.get(time)! });
      pump();
      return;
    }
    g.busy = true;
    const done = () => {
      g.video.removeEventListener("seeked", onSeeked);
      if (g.timer) clearTimeout(g.timer);
      g.timer = null;
      g.busy = false;
      if (grabberRef.current === g) pump();
    };
    const onSeeked = () => {
      const { videoWidth: w, videoHeight: h } = g.video;
      if (w && h) {
        g.canvas.width = FRAME_WIDTH;
        g.canvas.height = Math.round((FRAME_WIDTH * h) / w);
        const ctx = g.canvas.getContext("2d");
        if (ctx) {
          try {
            ctx.drawImage(g.video, 0, 0, g.canvas.width, g.canvas.height);
            const src = g.canvas.toDataURL("image/jpeg", 0.72);
            if (g.cache.size >= MAX_FRAMES) g.cache.delete(g.cache.keys().next().value!);
            g.cache.set(time, src);
            if (wantedRef.current === time) setFrame({ time, src });
          } catch {
            // A tainted canvas (a stream without CORS): no previews for this one
            failedRef.current = true;
          }
        }
      }
      done();
    };
    g.video.addEventListener("seeked", onSeeked);
    g.timer = setTimeout(done, SEEK_TIMEOUT);
    g.video.currentTime = time;
  }, []);

  const setup = useCallback(
    (startAt: number) => {
      if (!streamUrl) return null;
      const video = document.createElement("video");
      video.muted = true;
      video.playsInline = true;
      video.crossOrigin = "anonymous";
      video.preload = "auto";
      const g: Grabber = {
        video,
        hls: null,
        canvas: document.createElement("canvas"),
        ready: false,
        busy: false,
        pending: null,
        cache: new Map(),
        timer: null,
      };
      const fail = () => {
        failedRef.current = true;
        if (grabberRef.current === g) destroy();
        setFrame(null);
      };
      video.addEventListener(
        "loadedmetadata",
        () => {
          g.ready = true;
          pump();
        },
        { once: true }
      );
      video.addEventListener("error", fail, { once: true });

      if (Hls.isSupported()) {
        // The quality the player is loading, so the segments are the ones it already has
        const main = hlsRef.current;
        const level = main ? (main.currentLevel >= 0 ? main.currentLevel : main.loadLevel) : -1;
        const hls = new Hls({
          enableWorker: true,
          startLevel: level,
          startPosition: startAt,
          capLevelToPlayerSize: false,
          // Just the segment around the time asked
          maxBufferLength: 2,
          maxMaxBufferLength: 4,
          maxBufferSize: 20 * 1000 * 1000,
          backBufferLength: 0,
          manifestLoadingMaxRetry: 2,
          levelLoadingMaxRetry: 2,
          fragLoadingMaxRetry: 2,
        });
        hls.on(Hls.Events.MANIFEST_PARSED, () => {
          if (level >= 0) hls.loadLevel = level;
        });
        hls.on(Hls.Events.ERROR, (_, data) => {
          if (data.fatal) fail();
        });
        hls.loadSource(streamUrl);
        hls.attachMedia(video);
        g.hls = hls;
      } else if (video.canPlayType("application/vnd.apple.mpegurl")) {
        video.src = streamUrl;
      } else {
        return null;
      }
      return g;
    },
    [streamUrl, hlsRef, pump, destroy]
  );

  /** The time under the pointer, or null when it leaves the bar */
  const request = useCallback(
    (time: number | null) => {
      if (time === null || !enabled || failedRef.current) {
        wantedRef.current = null;
        setFrame(null);
        return;
      }
      const main = videoRef.current;
      const at = Math.round(time / STEP) * STEP;
      wantedRef.current = at;
      if (!main || !(within(main.buffered, at) || within(main.played, at))) {
        setFrame(null);
        return;
      }
      let g = grabberRef.current;
      const cached = g?.cache.get(at);
      if (cached) {
        setFrame({ time: at, src: cached });
        return;
      }
      if (!g) {
        g = setup(at);
        if (!g) {
          failedRef.current = true;
          return;
        }
        grabberRef.current = g;
      }
      // The last frame stays until this one is ready
      g.pending = at;
      pump();
    },
    [enabled, videoRef, setup, pump]
  );

  return { frame, request };
}
