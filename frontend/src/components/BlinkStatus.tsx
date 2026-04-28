"use client";

import type { BlinkRuntimeState } from "@/lib/blink/useBlink";

type Props = {
  blink: BlinkRuntimeState;
  longThresholdMs: number;
  lookUpThresholdMs: number;
};

/**
 * Debug + feedback panel: shows whether MediaPipe is ready, whether a face
 * is in frame, the current blink/look-up scores, and progress bars that fill
 * while the user holds each gesture (so they know when they've crossed the
 * long-blink and look-up thresholds).
 */
export function BlinkStatus({
  blink,
  longThresholdMs,
  lookUpThresholdMs,
}: Props) {
  const longProgress = Math.min(1, blink.closedForMs / longThresholdMs);
  const lookUpProgress = Math.min(1, blink.upForMs / lookUpThresholdMs);

  return (
    <div className="space-y-3 rounded-lg border border-white/15 bg-black/40 p-3 text-sm text-white">
      <div className="flex justify-between">
        <span className="text-white/60">Status</span>
        <span>
          {blink.error
            ? `error: ${blink.error}`
            : !blink.ready
              ? "loading…"
              : !blink.faceDetected
                ? "no face"
                : "tracking"}
        </span>
      </div>

      <div className="flex justify-between gap-4">
        <span className="text-white/60">Closedness</span>
        <span className="tabular-nums">{blink.closedness.toFixed(2)}</span>
        <span className="text-white/60">Upness</span>
        <span className="tabular-nums">{blink.upness.toFixed(2)}</span>
      </div>

      <div>
        <div className="flex justify-between text-xs text-white/60">
          <span>Hold blink (start / menu)</span>
          <span className="tabular-nums">
            {(blink.closedForMs / 1000).toFixed(1)}s
          </span>
        </div>
        <div className="h-2 overflow-hidden rounded bg-white/10">
          <div
            className="h-full bg-emerald-400 transition-[width]"
            style={{ width: `${longProgress * 100}%` }}
          />
        </div>
      </div>

      <div>
        <div className="flex justify-between text-xs text-white/60">
          <span>Hold look-up (space)</span>
          <span className="tabular-nums">
            {(blink.upForMs / 1000).toFixed(1)}s
          </span>
        </div>
        <div className="h-2 overflow-hidden rounded bg-white/10">
          <div
            className="h-full bg-sky-400 transition-[width]"
            style={{ width: `${lookUpProgress * 100}%` }}
          />
        </div>
      </div>
    </div>
  );
}
