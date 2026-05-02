/**
 * React hook that turns a raw <video> element into a stream of intentional
 * face-driven events. Four event kinds:
 *
 *   - "intent"    — short blink (>=intentMinMs, <longMinMs); locks a
 *                   selection in the scanner
 *   - "long"      — long blink (>=longMinMs); start scanning, open the
 *                   command menu, or cancel out of it
 *   - "lookUp"    — sustained upward gaze (>=lookUpMinMs); inserts a space
 *                   without going through the scanner
 *   - "lookRight" — sustained right gaze (>=lookRightHoldMs); fires once
 *                   per episode when the dwell threshold is crossed (the
 *                   suggestion-card "fill" completes), opening the
 *                   suggestion picker
 *
 * Each gesture has hysteresis (separate enter/exit thresholds) to keep
 * detection stable as scores wobble around the threshold.
 */
"use client";

import { useEffect, useRef, useState } from "react";

import { extractFaceScores, loadFaceLandmarker } from "./landmarker";

export type BlinkKind = "intent" | "long" | "lookUp" | "lookRight";

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
  /** Score threshold above which the user is considered to be looking right. */
  lookRightHigh: number;
  /** Score threshold below which the look-right gesture is considered released. */
  lookRightLow: number;
  /**
   * Sustained-gaze duration after which the look-right gesture fires. The
   * UI fills the suggestion card during this window so the user has a
   * reversible affordance — release before this and nothing happens.
   */
  lookRightHoldMs: number;
};

export const DEFAULT_BLINK_CONFIG: BlinkConfig = {
  closedThreshold: 0.5,
  openThreshold: 0.35,
  // 160ms — small step down from 170ms after the user found 170ms felt
  // slightly effortful. Still above the involuntary-blink range
  // (~100-130ms) so reflex blinks don't fire selections, but a relaxed
  // deliberate blink registers without needing to be exaggerated. 150ms
  // was too low (faint blinks slipped through), 170ms was too high.
  intentMinMs: 160,
  // 1500ms felt the right point in testing — comfortably above the
  // intent threshold so accidental fires are unlikely, but short enough
  // that opening the command menu mid-scan doesn't feel laborious.
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
  // Look-right uses the same hysteresis pair as look-up — the underlying
  // blendshapes have similar dynamic range. 1000ms hold matches the user's
  // expectation that a short glance off-screen is forgiven and only a
  // deliberate 1s gaze opens the suggestion picker.
  lookRightHigh: 0.4,
  lookRightLow: 0.2,
  lookRightHoldMs: 1000,
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
  /** Average of eyeLookOutRight + eyeLookInLeft (looking right from user POV). */
  rightness: number;
  isLookingRight: boolean;
  /** Live duration the user has been holding gaze right; drives chip cycling. */
  rightForMs: number;
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
    rightness: 0,
    isLookingRight: false,
    rightForMs: 0,
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

  // Look-right-episode tracking. Same fire-on-cross-threshold model as
  // look-up: one event per sustained-gaze episode, latched until release.
  const rightStartRef = useRef<number | null>(null);
  const lookRightFiredRef = useRef(false);

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
              rightStartRef.current = null;
              setState((s) => ({
                ...s,
                faceDetected: false,
                closedness: 0,
                isClosed: false,
                closedForMs: 0,
                upness: 0,
                isLookingUp: false,
                upForMs: 0,
                rightness: 0,
                isLookingRight: false,
                rightForMs: 0,
              }));
            } else {
              const closedness = (scores.blinkLeft + scores.blinkRight) / 2;
              const upness = (scores.lookUpLeft + scores.lookUpRight) / 2;
              // Looking right (from the user's POV): right eye rotates
              // outward, left eye rotates inward. Averaging gives a clean
              // signal robust to per-eye blendshape noise.
              const rightness =
                (scores.lookOutRight + scores.lookInLeft) / 2;

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

              // Look-up and look-right state.
              // Suppress while eyes are closed: gaze blendshapes aren't
              // meaningful during a blink, and we don't want "blink and roll
              // eyes up" to count as a deliberate gesture.
              if (isClosed) {
                upStartRef.current = null;
                lookUpFiredRef.current = false;
                rightStartRef.current = null;
                lookRightFiredRef.current = false;
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

                // Look-right: same fill-then-fire model as look-up. The UI
                // shows a single fill bar across the suggestion card while
                // rightForMs grows toward lookRightHoldMs; crossing the
                // threshold fires once and opens the picker.
                const wasRight = rightStartRef.current !== null;
                const isRight = wasRight
                  ? rightness > cfg.lookRightLow
                  : rightness > cfg.lookRightHigh;

                if (isRight && !wasRight) {
                  rightStartRef.current = now;
                  lookRightFiredRef.current = false;
                } else if (!isRight && wasRight) {
                  rightStartRef.current = null;
                  lookRightFiredRef.current = false;
                } else if (
                  isRight &&
                  wasRight &&
                  !lookRightFiredRef.current &&
                  now - (rightStartRef.current ?? now) >= cfg.lookRightHoldMs
                ) {
                  lookRightFiredRef.current = true;
                  onEventRef.current?.({
                    kind: "lookRight",
                    durationMs: now - (rightStartRef.current ?? now),
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
                rightness,
                isLookingRight: rightStartRef.current !== null,
                rightForMs:
                  rightStartRef.current !== null
                    ? now - rightStartRef.current
                    : 0,
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
