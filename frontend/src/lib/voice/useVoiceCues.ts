"use client";

import { useCallback, useEffect, useRef } from "react";

/**
 * Plays short audio cues via the /api/tts ElevenLabs proxy.
 *
 * The first time a phrase is requested we fetch and decode the MP3, cache
 * the resulting blob URL, then play it. Subsequent calls reuse the cached
 * URL so cues fire instantly with no network round-trip — important for
 * the scanner where a delayed "Starting" defeats the purpose.
 *
 * Pass `prewarm` phrases to fetch them on mount so the very first long
 * blink already has audio ready.
 */
export function useVoiceCues(prewarm: readonly string[] = []) {
  const cacheRef = useRef<Map<string, string>>(new Map());
  const currentRef = useRef<HTMLAudioElement | null>(null);

  const fetchUrl = useCallback(async (text: string): Promise<string> => {
    const cached = cacheRef.current.get(text);
    if (cached) return cached;
    const res = await fetch("/api/tts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
    if (!res.ok) throw new Error(`tts ${res.status}`);
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    cacheRef.current.set(text, url);
    return url;
  }, []);

  useEffect(() => {
    for (const phrase of prewarm) {
      void fetchUrl(phrase).catch(() => {
        // Silent: voice cues are an enhancement; if the key is missing
        // or the network is down, the scanner still works.
      });
    }
  }, [prewarm, fetchUrl]);

  // Browsers require a real user gesture (click / key / touch) before
  // Audio.play() will run. A long-blink isn't a gesture in the browser's
  // eyes, so without this the very first cue silently fails. We listen
  // once for any interaction and play+immediately-pause a muted Audio to
  // unlock playback for the rest of the session.
  useEffect(() => {
    let unlocked = false;
    const unlock = () => {
      if (unlocked) return;
      unlocked = true;
      const a = new Audio();
      a.muted = true;
      a.play().catch(() => {});
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
      window.removeEventListener("touchstart", unlock);
    };
    window.addEventListener("pointerdown", unlock);
    window.addEventListener("keydown", unlock);
    window.addEventListener("touchstart", unlock);
    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
      window.removeEventListener("touchstart", unlock);
    };
  }, []);

  useEffect(() => {
    const cache = cacheRef.current;
    return () => {
      cache.forEach((url) => URL.revokeObjectURL(url));
      cache.clear();
    };
  }, []);

  const speak = useCallback(
    async (text: string) => {
      try {
        const url = await fetchUrl(text);
        if (currentRef.current) {
          currentRef.current.pause();
          currentRef.current.currentTime = 0;
        }
        const audio = new Audio(url);
        currentRef.current = audio;
        await audio.play();
      } catch {
        // Swallow: cues are non-critical.
      }
    },
    [fetchUrl],
  );

  return speak;
}
