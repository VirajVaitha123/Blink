/**
 * React hook that turns a raw <video> element into a stream of intentional
 * face-driven events. Three event kinds:
 *
 *   - "intent"  — short blink (>=intentMinMs, <longMinMs); used to lock a
 *                 selection in the scanner
 *   - "long"    — long blink (>=longMinMs); used to start scanning, open
 *                 the command menu, or cancel out of it
 *   - "lookUp"  — sustained upward gaze (>=lookUpMinMs); used to insert a
 *                 space without going through the scanner
 *
 * Each gesture has hysteresis (separate enter/exit thresholds) to keep
 * detection stable as scores wobble around the threshold.
 */
"use client";

import { useEffect, useRef, useState } from "react";

import { extractFaceScores, loadFaceLandmarker } from "./landmarker";

export type BlinkKind = "intent" | "long" | "lookUp";

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
  /** Min duration to count as a long blink (start / command-menu signal). */
  longMinMs: number;
  /** Score threshold above which the user is considered to be looking up. */
  lookUpHigh: number;
  /** Score threshold below which the look-up gesture is considered released. */
  lookUpLow: number;
  /** Min sustained duration to count as a deliberate look-up. */
  lookUpMinMs: number;
};

export const DEFAULT_BLINK_CONFIG: BlinkConfig = {
  closedThreshold: 0.5,
  openThreshold: 0.35,
  // 150ms is just above the natural involuntary-blink range (~100-130ms)
  // so reflex blinks rarely fire selections, but a deliberate quick blink
  // still registers — important for users (or rows like Y/Z/⌫/☰) where
  // pacing matters and a 200ms hold felt sluggish in testing.
  intentMinMs: 150,
  // 1500ms felt the right point in testing — comfortably above the
  // intent threshold (200ms) so accidental fires are unlikely, but short
  // enough that opening the command menu mid-scan doesn't feel laborious.
  longMinMs: 1500,
  // Look-up: MediaPipe's eyeLookUp blendshapes measure iris rotation
  // relative to the head, not absolute gaze. Pure eye-look-up at a screen
  // typically peaks around 0.4-0.5 (you don't need to roll your eyes far
  // to see the top of the display). 0.4 / 0.2 hysteresis catches deliberate
  // upward gaze without triggering on natural top-of-screen glances at the
  // distances people use AAC apps from. Tune lower if needed for the user.
  lookUpHigh: 0.4,
  lookUpLow: 0.2,
  lookUpMinMs: 500,
};

export type BlinkRuntimeState = {
  ready: boolean;
  faceDetected: boolean;
  closedness: number;
  isClosed: boolean;
  closedForMs: number;
  upness: number;
  isLookingUp: boolean;
  upForMs: number;
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
    upness: 0,
    isLookingUp: false,
    upForMs: 0,
    error: null,
  });

  // Always-fresh callback ref. Update in an effect (not during render) so
  // the react-hooks/refs lint is happy; the rAF tick reads `.current` from
  // event-loop-time, by which point the latest update has committed.
  const onEventRef = useRef(onEvent);
  useEffect(() => {
    onEventRef.current = onEvent;
  });

  // Blink-episode tracking
  const closedStartRef = useRef<number | null>(null);
  const longFiredRef = useRef(false);

  // Look-up-episode tracking
  const upStartRef = useRef<number | null>(null);
  const lookUpFiredRef = useRef(false);

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
            const scores = extractFaceScores(result);

            if (!scores) {
              // No face — reset all tracking so we don't spuriously fire on
              // re-acquire.
              closedStartRef.current = null;
              longFiredRef.current = false;
              upStartRef.current = null;
              lookUpFiredRef.current = false;
              setState((s) => ({
                ...s,
                faceDetected: false,
                closedness: 0,
                isClosed: false,
                closedForMs: 0,
                upness: 0,
                isLookingUp: false,
                upForMs: 0,
              }));
            } else {
              const closedness = (scores.blinkLeft + scores.blinkRight) / 2;
              const upness = (scores.lookUpLeft + scores.lookUpRight) / 2;

              // Blink state
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
                  // Long already fired; ignore the trailing release.
                } else if (duration >= cfg.intentMinMs) {
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
                // Crossed the long threshold while still closed — fire now so
                // the user gets feedback without having to open their eyes.
                longFiredRef.current = true;
                onEventRef.current?.({
                  kind: "long",
                  durationMs: now - (closedStartRef.current ?? now),
                  at: now,
                });
              }

              // Look-up state.
              // Suppress while eyes are closed: gaze blendshapes aren't
              // meaningful during a blink, and we don't want "blink and roll
              // eyes up" to count as a deliberate gesture.
              if (isClosed) {
                upStartRef.current = null;
                lookUpFiredRef.current = false;
              } else {
                const wasUp = upStartRef.current !== null;
                const isUp = wasUp
                  ? upness > cfg.lookUpLow
                  : upness > cfg.lookUpHigh;

                if (isUp && !wasUp) {
                  upStartRef.current = now;
                  lookUpFiredRef.current = false;
                } else if (!isUp && wasUp) {
                  upStartRef.current = null;
                  lookUpFiredRef.current = false;
                } else if (
                  isUp &&
                  wasUp &&
                  !lookUpFiredRef.current &&
                  now - (upStartRef.current ?? now) >= cfg.lookUpMinMs
                ) {
                  // Sustained — fire once per episode.
                  lookUpFiredRef.current = true;
                  onEventRef.current?.({
                    kind: "lookUp",
                    durationMs: now - (upStartRef.current ?? now),
                    at: now,
                  });
                }
              }

              setState({
                ready: true,
                faceDetected: true,
                closedness,
                isClosed,
                closedForMs:
                  closedStartRef.current !== null
                    ? now - closedStartRef.current
                    : 0,
                upness,
                isLookingUp: upStartRef.current !== null,
                upForMs:
                  upStartRef.current !== null ? now - upStartRef.current : 0,
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, videoRef]);

  return state;
}
