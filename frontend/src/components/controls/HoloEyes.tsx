"use client";

import { useEffect, useId, useRef } from "react";

import type { BlinkKind, BlinkRuntime } from "@/lib/blink/useBlink";
import { GESTURES, type EyePose } from "@/lib/controls/controls";

type Props = {
  /** Gesture to act out on a loop, or null for a calm idle with blinks. */
  demo: BlinkKind | null;
  /** When set, the eyes mirror the user's own eyes instead of the demo. */
  live: BlinkRuntime | null;
  /** Hologram tint — the colour of the focused gesture's action. */
  color: string;
};

const NEUTRAL: EyePose = { gx: 0, gy: 0, open: 1 };
const SHUT: EyePose = { gx: 0, gy: 0, open: 0.04 };

type Step = readonly [pose: EyePose, ms: number];

/** Looping choreography that acts out a gesture at roughly real speed. */
function demoSteps(demo: BlinkKind | null): readonly Step[] {
  if (demo === null) {
    return [
      [NEUTRAL, 3200],
      [SHUT, 130],
    ];
  }
  const pose = GESTURES[demo].pose;
  if (demo === "intent") {
    return [
      [NEUTRAL, 1000],
      [pose, 380],
    ];
  }
  if (demo === "long") {
    return [
      [NEUTRAL, 1000],
      [pose, 1700],
    ];
  }
  return [
    [NEUTRAL, 800],
    [pose, 1100],
  ];
}

const clamp = (v: number, min: number, max: number) =>
  Math.max(min, Math.min(max, v));

// Almond eye outline, centred on the origin: 180 wide, ~78 tall.
const ALMOND = "M -90 0 Q 0 -78 90 0 Q 0 78 -90 0 Z";
const EYE_CENTRES = [130, 350] as const;
const TICK_ANGLES = Array.from({ length: 24 }, (_, i) => i * 15);

/**
 * A projected pair of eyes. Pose is driven through three CSS variables
 * (--gx, --gy, --open) written straight to the DOM, so neither the demo
 * loop nor the live camera feed re-renders React.
 */
export function HoloEyes({ demo, live, color }: Props) {
  const poseRef = useRef<HTMLDivElement>(null);
  const clipId = useId();

  useEffect(() => {
    const el = poseRef.current;
    if (!el) return;
    const apply = (pose: EyePose) => {
      el.style.setProperty("--gx", pose.gx.toFixed(3));
      el.style.setProperty("--gy", pose.gy.toFixed(3));
      el.style.setProperty("--open", pose.open.toFixed(3));
    };

    if (live) {
      // Mirror view: looking to your left moves the pupils to screen-left.
      // Blendshape scores rarely exceed ~0.6, hence the gain.
      const sync = () => {
        const m = live.metricsRef.current;
        apply({
          gx: clamp((m.rightness - m.leftness) * 1.9, -1, 1),
          gy: clamp((m.downness * 0.7 - m.upness * 1.4) * 1.7, -1, 1),
          open: clamp(1 - m.closedness * 1.35, 0.04, 1),
        });
      };
      sync();
      return live.subscribe(sync);
    }

    const steps = demoSteps(demo);
    let index = 0;
    let timer: number;
    const run = () => {
      const [pose, ms] = steps[index];
      apply(pose);
      index = (index + 1) % steps.length;
      timer = window.setTimeout(run, ms);
    };
    run();
    return () => window.clearTimeout(timer);
  }, [demo, live]);

  return (
    <div
      className="holo relative mx-auto w-full max-w-[520px] select-none"
      style={{ "--holo": color } as React.CSSProperties}
      aria-hidden
    >
      {/* Projector beam + emitter, behind the figure. */}
      <div className="holo-beam pointer-events-none absolute inset-x-[6%] bottom-3 top-[30%] opacity-40" />
      <div className="holo-emitter pointer-events-none absolute bottom-0 left-1/2 h-6 w-2/5 -translate-x-1/2 rounded-[50%]" />

      <div ref={poseRef} className="holo-figure relative pb-9">
        <svg
          viewBox="0 0 480 230"
          className="block w-full"
          fill="none"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          {/* HUD frame: corner brackets and a centre bridge. */}
          <g strokeWidth="1.5" opacity="0.55">
            <path d="M 14 40 V 16 H 44" />
            <path d="M 466 40 V 16 H 436" />
            <path d="M 14 190 V 214 H 44" />
            <path d="M 466 190 V 214 H 436" />
            <path d="M 226 115 H 254" strokeDasharray="2 5" />
          </g>

          {EYE_CENTRES.map((cx, i) => (
            <g key={cx} transform={`translate(${cx} 115)`}>
              <clipPath id={`${clipId}-${i}`}>
                <path className="holo-lid" d={ALMOND} />
              </clipPath>

              {/* Orbit ring with range ticks — the "measurement" layer. */}
              <g opacity="0.35" strokeWidth="1">
                <circle
                  className="holo-spin holo-spin-reverse"
                  r="100"
                  strokeDasharray="1 9"
                />
                <path d="M -112 0 H -100 M 100 0 H 112 M 0 -76 V -66 M 0 66 V 76" />
              </g>

              {/* Eyeball contents, clipped by the lid so a blink hides them. */}
              <g clipPath={`url(#${clipId}-${i})`}>
                <path
                  d={ALMOND}
                  fill="currentColor"
                  fillOpacity="0.07"
                  stroke="none"
                />
                <g className="holo-iris">
                  <circle r="33" strokeWidth="2" />
                  <circle
                    className="holo-spin"
                    r="26"
                    strokeWidth="1.5"
                    strokeDasharray="5 6"
                    opacity="0.8"
                  />
                  <g strokeWidth="1" opacity="0.6">
                    {TICK_ANGLES.map((a) => (
                      <path key={a} d="M 0 -20 V -14" transform={`rotate(${a})`} />
                    ))}
                  </g>
                  <circle r="11" fill="currentColor" stroke="none" />
                  <circle
                    cx="-5"
                    cy="-5"
                    r="3"
                    fill="#fff"
                    fillOpacity="0.85"
                    stroke="none"
                  />
                </g>
              </g>

              {/* Lid outline, drawn last so it stays crisp over the iris. */}
              <path className="holo-lid" d={ALMOND} strokeWidth="2.5" />
            </g>
          ))}
        </svg>
        <div className="holo-scanlines pointer-events-none absolute inset-0" />
      </div>
    </div>
  );
}
