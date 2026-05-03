"use client";

import { useCallback, useEffect, useRef } from "react";

import { STATIC_AUDIO } from "./staticAudio";

/**
 * Plays short audio cues. Two sources, transparent to callers:
 *
 *   - **Static manifest** (`STATIC_AUDIO`): pre-recorded MP3s in
 *     /public/audio/ for cues whose TTS rendering sounded off (the
 *     letter-name cues "A. to. D." etc.). Returned as a static URL —
 *     no API call, no quota burn, instant first play after the
 *     browser has cached the file.
 *
 *   - **ElevenLabs proxy** (`/api/tts`): everything else. The first
 *     play fetches and decodes the MP3, caches the blob URL, then
 *     plays. Subsequent plays of the same phrase reuse the cache.
 *
 * Pass `prewarm` phrases to warm both paths on mount — for static
 * URLs we issue a fetch so the browser caches the file; for API
 * URLs we fetch through the proxy and cache the blob.
 */
export function useVoiceCues(prewarm: readonly string[] = []) {
  const cacheRef = useRef<Map<string, string>>(new Map());
  const currentRef = useRef<HTMLAudioElement | null>(null);

  const fetchUrl = useCallback(async (text: string): Promise<string> => {
    const cached = cacheRef.current.get(text);
    if (cached) return cached;

    // Static manifest: hand back the pre-recorded URL directly. We
    // also kick off a `fetch` so the browser warms its HTTP cache; by
    // the time `new Audio(url).play()` runs in `speak`, the bytes are
    // already local. The fetch is fire-and-forget — failure just
    // means the first play has its usual ~50ms HTTP fetch.
    const staticUrl = STATIC_AUDIO[text];
    if (staticUrl) {
      cacheRef.current.set(text, staticUrl);
      void fetch(staticUrl).catch(() => {});
      return staticUrl;
    }

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
