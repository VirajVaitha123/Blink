/**
 * React hook that turns a raw <video> element into a stream of intentional
 * blink events. Distinguishes:
 *
 *   - "natural" blinks (<200ms eyes-closed) — ignored
 *   - "intent" blinks (≥200ms, <3000ms) — used to lock a selection
 *   - "long" blinks (≥3000ms) — used to start scanning
 *
 * Detection is binary on the `closedness` score (mean of left/right
 * eyeBlink blendshapes) crossing `closedThreshold`. Hysteresis is provided
 * by separate close/open thresholds.
 */
"use client";

import { useEffect, useRef, useState } from "react";

import { extractBlinkScore, loadFaceLandmarker } from "./landmarker";

export type BlinkKind = "intent" | "long";

export type BlinkEvent = {
  kind: BlinkKind;
  durationMs: number;
  at: number;
};

export type BlinkConfig = {
  /** Score threshold above which eyes are considered closed. */
  closedThreshold: number;
  /** Score threshold below which eyes are considered open (hysteresis). */
  openThreshold: number;
  /** Min duration to count as an intentional short blink. */
  intentMinMs: number;
  /** Min duration to count as a long blink (start signal). */
  longMinMs: number;
};

export const DEFAULT_BLINK_CONFIG: BlinkConfig = {
  closedThreshold: 0.5,
  openThreshold: 0.35,
  intentMinMs: 200,
  longMinMs: 3000,
};

export type BlinkRuntimeState = {
  ready: boolean;
  faceDetected: boolean;
  closedness: number;
  isClosed: boolean;
  closedForMs: number;
  error: string | null;
};

export type UseBlinkOptions = {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  enabled: boolean;
  config?: Partial<BlinkConfig>;
  onEvent?: (event: BlinkEvent) => void;
};

export function useBlink({
  videoRef,
  enabled,
  config,
  onEvent,
}: UseBlinkOptions): BlinkRuntimeState {
  const cfg = { ...DEFAULT_BLINK_CONFIG, ...config };

  const [state, setState] = useState<BlinkRuntimeState>({
    ready: false,
    faceDetected: false,
    closedness: 0,
    isClosed: false,
    closedForMs: 0,
    error: null,
  });

  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;

  // Track current closed-eye episode start time (performance.now()).
  const closedStartRef = useRef<number | null>(null);
  // True once we've already fired a "long" event for the current closed
  // episode — prevents firing a second short "intent" when the eyes finally
  // open after a long hold.
  const longFiredRef = useRef(false);

  useEffect(() => {
    if (!enabled) return;
    const video = videoRef.current;
    if (!video) return;

    let cancelled = false;
    let rafId: number | null = null;
    let lastVideoTime = -1;

    (async () => {
      try {
        const landmarker = await loadFaceLandmarker();
        if (cancelled) return;
        setState((s) => ({ ...s, ready: true }));

        const tick = () => {
          if (cancelled) return;
          if (video.readyState >= 2 && video.currentTime !== lastVideoTime) {
            lastVideoTime = video.currentTime;
            const now = performance.now();
            const result = landmarker.detectForVideo(video, now);
            const score = extractBlinkScore(result);

            if (!score) {
              // No face — reset closed tracking so we don't spuriously fire on
              // re-acquire.
              closedStartRef.current = null;
              longFiredRef.current = false;
              setState((s) => ({
                ...s,
                faceDetected: false,
                closedness: 0,
                isClosed: false,
                closedForMs: 0,
              }));
            } else {
              const closedness = (score.left + score.right) / 2;
              const wasClosed = closedStartRef.current !== null;
              const isClosed = wasClosed
                ? closedness > cfg.openThreshold
                : closedness > cfg.closedThreshold;

              if (isClosed && !wasClosed) {
                closedStartRef.current = now;
                longFiredRef.current = false;
              } else if (!isClosed && wasClosed) {
                const duration = now - (closedStartRef.current ?? now);
                closedStartRef.current = null;
                if (longFiredRef.current) {
                  // Long already fired — don't double-fire on release.
                } else if (duration >= cfg.intentMinMs) {
                  // Treat anything ≥intent that opened before reaching long
                  // as an "intent" blink.
                  onEventRef.current?.({
                    kind: "intent",
                    durationMs: duration,
                    at: now,
                  });
                }
                longFiredRef.current = false;
              } else if (
                isClosed &&
                wasClosed &&
                !longFiredRef.current &&
                now - (closedStartRef.current ?? now) >= cfg.longMinMs
              ) {
                // Crossed the long threshold — fire immediately so the user
                // gets feedback without having to open their eyes first.
                longFiredRef.current = true;
                onEventRef.current?.({
                  kind: "long",
                  durationMs: now - (closedStartRef.current ?? now),
                  at: now,
                });
              }

              const closedForMs =
                closedStartRef.current !== null
                  ? now - closedStartRef.current
                  : 0;

              setState({
                ready: true,
                faceDetected: true,
                closedness,
                isClosed,
                closedForMs,
                error: null,
              });
            }
          }
          rafId = requestAnimationFrame(tick);
        };

        rafId = requestAnimationFrame(tick);
      } catch (e) {
        if (!cancelled) {
          // Emscripten / MediaPipe propagate WASM/script load failures as
          // raw `Event` objects, which stringify uselessly to "[object Event]".
          // Dig out something diagnostic.
          const msg =
            e instanceof Error
              ? e.message
              : e instanceof Event
                ? `model or wasm failed to load (${e.type}${
                    e.target && "src" in e.target
                      ? ` from ${(e.target as { src?: string }).src}`
                      : ""
                  })`
                : typeof e === "string"
                  ? e
                  : JSON.stringify(e);
          setState((s) => ({ ...s, error: msg }));
        }
      }
    })();

    return () => {
      cancelled = true;
      if (rafId !== null) cancelAnimationFrame(rafId);
    };
    // We deliberately depend only on `enabled` + the video element ref's
    // .current — config changes are picked up via the cfg snapshot at the
    // start of each effect run.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, videoRef]);

  return state;
}
