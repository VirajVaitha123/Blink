/**
 * Subscribe to a per-frame blink metric with a frame-rate cap. The MediaPipe
 * tick fires ~30 times a second; for most UI ("warming up", "1.2s", a fill
 * bar) updating React state that often is wasted work. The returned value
 * is throttled — at most one update per `intervalMs`.
 *
 * Pair the throttle with a CSS transition (e.g. `transition-[width]
 * duration-150`) and the animation looks just as smooth as 30 fps even at
 * 100 ms updates.
 */
"use client";

import { useEffect, useState } from "react";

import type { BlinkMetrics, BlinkRuntime } from "./useBlink";

export function useBlinkMetric<T>(
  blink: BlinkRuntime,
  selector: (m: Readonly<BlinkMetrics>) => T,
  intervalMs = 100,
): T {
  const [value, setValue] = useState<T>(() => selector(blink.metricsRef.current));

  // Depend on the (stable) subscribe + ref handles, not `blink` itself —
  // the runtime object re-identifies whenever discrete state flips, and
  // we don't want that to tear down our subscription mid-gesture.
  const { subscribeMetrics, metricsRef } = blink;
  useEffect(() => {
    let last = 0;
    // Seed with the latest value in case the metrics changed between
    // mount and the first listener fire.
    setValue(selector(metricsRef.current));
    return subscribeMetrics((m) => {
      const now = performance.now();
      if (now - last < intervalMs) return;
      last = now;
      const next = selector(m);
      setValue((prev) => (Object.is(prev, next) ? prev : next));
    });
    // selector is intentionally untracked: callers usually pass an inline
    // arrow, and re-subscribing on every render would defeat the throttle.
    // Treat the selector as captured-once at mount time.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subscribeMetrics, metricsRef, intervalMs]);

  return value;
}
