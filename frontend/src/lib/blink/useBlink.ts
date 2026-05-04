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
 * Detection logic (hysteresis + episode latching) lives in `detectors.ts`
 * — this hook is just the MediaPipe lifecycle, the rAF loop, and the
 * React-state plumbing.
 *
 * State is split into two channels:
 *
 *   - "discrete" lives in React state and only updates when something flips
 *     (ready, faceDetected, isClosed, isLookingUp, isLookingRight, error).
 *     Most components only need this; they don't re-render every frame.
 *
 *   - "metrics" lives in a ref + a throttled pub/sub shaped for React's
 *     `useSyncExternalStore`. The MediaPipe rAF tick mutates the ref in
 *     place every frame and notifies listeners at most every NOTIFY_MS.
 *     `useBlinkMetric` pulls a single field by key and lets React skip
 *     re-renders when nothing it cares about changed.
 */
"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import {
  createBlinkDetector,
  createSustainDetector,
  type Detector,
} from "./detectors";
import { extractFaceScores, loadFaceLandmarker } from "./landmarker";

export type BlinkKind =
  | "intent"
  | "long"
  | "lookUp"
  | "lookRight"
  | "lookLeft"
  | "lookDown";

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
  /** Score threshold above which the user is considered to be looking left. */
  lookLeftHigh: number;
  /** Score threshold below which the look-left gesture is considered released. */
  lookLeftLow: number;
  /**
   * Sustained-gaze duration after which the look-left gesture fires
   * (= backspace, with a dwell-fill on the menu Backspace pill).
   * Release before this and nothing happens — same reversible-affordance
   * pattern as look-right (suggestion picker).
   */
  lookLeftHoldMs: number;
  /** Score threshold above which the user is considered to be looking down. */
  lookDownHigh: number;
  /** Score threshold below which the look-down gesture is considered released. */
  lookDownLow: number;
  /**
   * Sustained-gaze duration after which the look-down gesture fires
   * (= backspace, with a fill bar on the menu Backspace pill providing
   * visual countdown). Longer than look-left (instant backspace) because
   * the fill is the affordance — release before this and nothing happens.
   */
  lookDownHoldMs: number;
};

export const DEFAULT_BLINK_CONFIG: BlinkConfig = {
  closedThreshold: 0.5,
  openThreshold: 0.35,
  // 500ms — under the new control scheme a short-but-sustained blink
  // (released between intentMinMs and longMinMs) inserts a *space*; the
  // *select* gesture moved to look-up. The threshold is deliberately
  // well above the involuntary-blink range (~100-130ms) and even above
  // a casual eye-rest blink (~250ms), so spaces only fire when the user
  // clearly closes their eyes for half a second on purpose.
  intentMinMs: 500,
  // 1500ms felt the right point in testing — comfortably above the
  // intent threshold so accidental fires are unlikely, but short enough
  // that opening the command menu mid-scan doesn't feel laborious.
  longMinMs: 1500,
  // Look-up: MediaPipe's eyeLookUp blendshapes measure iris rotation
  // relative to the head, not absolute gaze. Pure eye-look-up at a screen
  // peaks around 0.3-0.5 depending on the user's head tilt + camera
  // height. Some users top out at ~0.35 — at 0.4 entry their commits
  // miss. Dropped enter 0.4 → 0.3 and exit 0.2 → 0.15 to widen the
  // detection band; at 60ms sustain there's no timing budget left to
  // give, this is the only knob that helps.
  lookUpHigh: 0.3,
  lookUpLow: 0.15,
  // 60ms — at the floor of what's meaningful. The MediaPipe inference
  // ticks at the camera's frame rate (~30fps = ~33ms per frame), so
  // this is ~2 frames of confirmation. Going below ~33ms has no effect
  // because the detector only sees one score per frame. Iterated down
  // 500 → 250 → 125 → 60ms because the user wanted commit to feel
  // immediate. The 0.4/0.2 hysteresis is doing all the filtering now;
  // raise lookUpHigh (entry threshold) rather than this if false fires
  // creep in.
  lookUpMinMs: 60,
  // Look-right uses the same hysteresis pair as look-up — the underlying
  // blendshapes have similar dynamic range. 1000ms hold matches the user's
  // expectation that a short glance off-screen is forgiven and only a
  // deliberate 1s gaze opens the suggestion picker.
  lookRightHigh: 0.4,
  lookRightLow: 0.2,
  lookRightHoldMs: 1000,
  // Look-left = backspace, with a dwell-fill on the menu Backspace
  // pill providing visual countdown + reversibility. Iterated through
  // a few designs: instant 150ms felt twitchy (off-screen glances ate
  // characters); look-down at 800ms with fill worked well but the user
  // preferred the gesture on look-left. Same 800ms hold + same fill.
  lookLeftHigh: 0.4,
  lookLeftLow: 0.2,
  lookLeftHoldMs: 800,
  // Look-down = backspace. The Backspace pill shows a dwell-fill that
  // grows during the hold so the gesture is reversible (release to
  // abort) and visible in peripheral vision.
  //
  // Thresholds are deliberately *much* higher than the other gaze
  // gestures: 0.7 enter / 0.5 exit instead of 0.4 / 0.2. The eyeLookDown
  // blendshape sits in the 0.2-0.4 range during normal screen-reading
  // (camera is typically above the screen, so the user's gaze rests
  // slightly below neutral). With the old 0.4/0.2 pair the detector
  // fired repeatedly — every score wobble below 0.2 re-armed it, and
  // every cross above 0.4 fired another "Backspace" 800ms later. The
  // user has to actually look down toward their lap to clear 0.7 now.
  lookDownHigh: 0.7,
  lookDownLow: 0.5,
  lookDownHoldMs: 800,
};

/** Discrete state — flips a few times per session, safe to put in setState. */
export type BlinkDiscreteState = {
  ready: boolean;
  faceDetected: boolean;
  isClosed: boolean;
  isLookingUp: boolean;
  isLookingRight: boolean;
  isLookingLeft: boolean;
  isLookingDown: boolean;
  error: string | null;
};

/** Continuous per-frame metrics — never goes through React state. */
export type BlinkMetrics = {
  closedness: number;
  closedForMs: number;
  upness: number;
  upForMs: number;
  rightness: number;
  rightForMs: number;
  leftness: number;
  leftForMs: number;
  downness: number;
  downForMs: number;
};

/**
 * How often the metrics pub/sub wakes subscribers, in ms. The rAF tick
 * mutates the ref every frame regardless; subscribers (e.g. the meter
 * bars, the dwell-fill) only get the chance to re-render every NOTIFY_MS.
 * 100ms paired with the existing CSS `transition-[width] duration-75`
 * animation on the bars looks indistinguishable from per-frame updates.
 */
const NOTIFY_MS = 100;

const ZERO_METRICS: BlinkMetrics = {
  closedness: 0,
  closedForMs: 0,
  upness: 0,
  upForMs: 0,
  rightness: 0,
  rightForMs: 0,
  leftness: 0,
  leftForMs: 0,
  downness: 0,
  downForMs: 0,
};

const INITIAL_DISCRETE: BlinkDiscreteState = {
  ready: false,
  faceDetected: false,
  isClosed: false,
  isLookingUp: false,
  isLookingRight: false,
  isLookingLeft: false,
  isLookingDown: false,
  error: null,
};

export type BlinkRuntime = BlinkDiscreteState & {
  /** Read-only handle to the latest metrics. Mutated in place each frame. */
  readonly metricsRef: { readonly current: Readonly<BlinkMetrics> };
  /**
   * `useSyncExternalStore`-shaped subscribe. Listener is called (with no
   * args) when metrics may have changed; consumers re-read from
   * `metricsRef.current` to get the latest values. Throttled to NOTIFY_MS
   * so high-frequency frames don't kick React more than ~10×/second.
   */
  subscribe(listener: () => void): () => void;
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
}: UseBlinkOptions): BlinkRuntime {
  const cfg = { ...DEFAULT_BLINK_CONFIG, ...config };

  const [discrete, setDiscrete] = useState<BlinkDiscreteState>(INITIAL_DISCRETE);

  // Always-fresh callback ref. Update in an effect (not during render) so
  // the react-hooks/refs lint is happy; the rAF tick reads `.current` from
  // event-loop-time, by which point the latest update has committed.
  const onEventRef = useRef(onEvent);
  useEffect(() => {
    onEventRef.current = onEvent;
  });

  // Per-frame metrics live in a ref so updating them doesn't trigger React
  // reconciliation. Mutated in place inside the rAF tick.
  const metricsRef = useRef<BlinkMetrics>({ ...ZERO_METRICS });

  // Listeners for the metrics pub/sub. Stored in a ref so subscribe/notify
  // don't need to be redeclared between renders.
  const listenersRef = useRef<Set<() => void>>(new Set());

  const subscribe = useMemo(
    () => (listener: () => void) => {
      listenersRef.current.add(listener);
      return () => {
        listenersRef.current.delete(listener);
      };
    },
    [],
  );

  useEffect(() => {
    if (!enabled) return;
    const video = videoRef.current;
    if (!video) return;

    let cancelled = false;
    let rafId: number | null = null;
    let lastVideoTime = -1;
    let lastNotifyAt = 0;

    // Per-detector state lives outside React; reset on enabled-cycle.
    const blinkDetector = createBlinkDetector({
      closedThreshold: cfg.closedThreshold,
      openThreshold: cfg.openThreshold,
      intentMinMs: cfg.intentMinMs,
      longMinMs: cfg.longMinMs,
    });
    const lookUpDetector = createSustainDetector({
      kind: "lookUp" as const,
      enterThreshold: cfg.lookUpHigh,
      exitThreshold: cfg.lookUpLow,
      sustainMs: cfg.lookUpMinMs,
    });
    const lookRightDetector = createSustainDetector({
      kind: "lookRight" as const,
      enterThreshold: cfg.lookRightHigh,
      exitThreshold: cfg.lookRightLow,
      sustainMs: cfg.lookRightHoldMs,
    });
    const lookLeftDetector = createSustainDetector({
      kind: "lookLeft" as const,
      enterThreshold: cfg.lookLeftHigh,
      exitThreshold: cfg.lookLeftLow,
      sustainMs: cfg.lookLeftHoldMs,
    });
    const lookDownDetector = createSustainDetector({
      kind: "lookDown" as const,
      enterThreshold: cfg.lookDownHigh,
      exitThreshold: cfg.lookDownLow,
      sustainMs: cfg.lookDownHoldMs,
    });

    // Tracks the discrete fields we last published, so we only call
    // setState when something actually flipped — avoids spurious renders.
    let lastDiscrete: BlinkDiscreteState = INITIAL_DISCRETE;

    const publishDiscreteIfChanged = (next: BlinkDiscreteState) => {
      if (
        next.ready === lastDiscrete.ready &&
        next.faceDetected === lastDiscrete.faceDetected &&
        next.isClosed === lastDiscrete.isClosed &&
        next.isLookingUp === lastDiscrete.isLookingUp &&
        next.isLookingRight === lastDiscrete.isLookingRight &&
        next.isLookingLeft === lastDiscrete.isLookingLeft &&
        next.isLookingDown === lastDiscrete.isLookingDown &&
        next.error === lastDiscrete.error
      ) {
        return;
      }
      lastDiscrete = next;
      setDiscrete(next);
    };

    const notifyMetricsThrottled = (now: number) => {
      if (now - lastNotifyAt < NOTIFY_MS) return;
      lastNotifyAt = now;
      for (const listener of listenersRef.current) listener();
    };

    const dispatch = <K extends BlinkKind>(
      detector: Detector<K>,
      score: number,
      now: number,
    ) => {
      const event = detector.update(score, now);
      if (event) {
        onEventRef.current?.({
          kind: event.kind,
          durationMs: event.durationMs,
          at: now,
        });
      }
    };

    (async () => {
      try {
        const landmarker = await loadFaceLandmarker();
        if (cancelled) return;
        publishDiscreteIfChanged({ ...lastDiscrete, ready: true });

        const tick = () => {
          if (cancelled) return;
          if (video.readyState >= 2 && video.currentTime !== lastVideoTime) {
            lastVideoTime = video.currentTime;
            const now = performance.now();
            const result = landmarker.detectForVideo(video, now);
            const scores = extractFaceScores(result);

            if (!scores) {
              // No face — reset all detectors so we don't spuriously fire
              // on re-acquire.
              blinkDetector.reset();
              lookUpDetector.reset();
              lookRightDetector.reset();
              lookLeftDetector.reset();
              lookDownDetector.reset();

              const m = metricsRef.current;
              m.closedness = 0;
              m.closedForMs = 0;
              m.upness = 0;
              m.upForMs = 0;
              m.rightness = 0;
              m.rightForMs = 0;
              m.leftness = 0;
              m.leftForMs = 0;
              m.downness = 0;
              m.downForMs = 0;
              notifyMetricsThrottled(now);

              publishDiscreteIfChanged({
                ...lastDiscrete,
                faceDetected: false,
                isClosed: false,
                isLookingUp: false,
                isLookingRight: false,
                isLookingLeft: false,
                isLookingDown: false,
              });
            } else {
              const closedness = (scores.blinkLeft + scores.blinkRight) / 2;
              const upness = (scores.lookUpLeft + scores.lookUpRight) / 2;
              const downness =
                (scores.lookDownLeft + scores.lookDownRight) / 2;
              // Looking right (from the user's POV): right eye rotates
              // outward, left eye rotates inward. Averaging gives a clean
              // signal robust to per-eye blendshape noise.
              const rightness =
                (scores.lookOutRight + scores.lookInLeft) / 2;
              // Looking left: mirror — left eye outward + right eye inward.
              const leftness =
                (scores.lookOutLeft + scores.lookInRight) / 2;

              dispatch(blinkDetector, closedness, now);

              // Suppress gaze tracking while eyes are closed: gaze
              // blendshapes aren't meaningful during a blink, and we don't
              // want "blink and roll eyes up" to count as a deliberate
              // gesture. blinkDetector.holdMs > 0 means we're in a blink
              // episode right now.
              const inBlink = blinkDetector.holdMs > 0;
              if (inBlink) {
                lookUpDetector.reset();
                lookRightDetector.reset();
                lookLeftDetector.reset();
                lookDownDetector.reset();
              } else {
                dispatch(lookUpDetector, upness, now);
                dispatch(lookRightDetector, rightness, now);
                dispatch(lookLeftDetector, leftness, now);
                dispatch(lookDownDetector, downness, now);
              }

              const m = metricsRef.current;
              m.closedness = closedness;
              m.closedForMs = blinkDetector.holdMs;
              m.upness = upness;
              m.upForMs = lookUpDetector.holdMs;
              m.rightness = rightness;
              m.rightForMs = lookRightDetector.holdMs;
              m.leftness = leftness;
              m.leftForMs = lookLeftDetector.holdMs;
              m.downness = downness;
              m.downForMs = lookDownDetector.holdMs;
              notifyMetricsThrottled(now);

              publishDiscreteIfChanged({
                ready: true,
                faceDetected: true,
                isClosed: blinkDetector.holdMs > 0,
                isLookingUp: lookUpDetector.holdMs > 0,
                isLookingRight: lookRightDetector.holdMs > 0,
                isLookingLeft: lookLeftDetector.holdMs > 0,
                isLookingDown: lookDownDetector.holdMs > 0,
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
          publishDiscreteIfChanged({ ...lastDiscrete, error: msg });
        }
      }
    })();

    return () => {
      cancelled = true;
      if (rafId !== null) cancelAnimationFrame(rafId);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, videoRef]);

  // Memoise the runtime object so consumers get a stable reference unless
  // discrete state actually changed.
  return useMemo<BlinkRuntime>(
    () => ({
      ...discrete,
      metricsRef,
      subscribe,
    }),
    [discrete, subscribe],
  );
}
