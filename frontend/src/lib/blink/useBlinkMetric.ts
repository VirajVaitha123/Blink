/**
 * Read a single metric from the blink runtime, subscribing for live
 * updates. Built on `useSyncExternalStore` (React 18+'s official
 * external-store primitive), so it plays correctly with concurrent
 * rendering and Strict Mode.
 *
 * The throttling that keeps re-renders cheap lives **inside** the runtime's
 * `subscribe` (capped at NOTIFY_MS in `useBlink.ts`) — every consumer
 * inherits it for free, and one config value controls the global rate.
 *
 * The API is key-based (`useBlinkMetric(blink, "rightForMs")`) rather than
 * selector-based to avoid the closure-staleness footgun: a selector like
 * `(m) => m.rightForMs / holdMs` would capture `holdMs` at mount time and
 * never see a new value if the prop changed.
 */
"use client";

import { useSyncExternalStore } from "react";

import type { BlinkMetrics, BlinkRuntime } from "./useBlink";

export function useBlinkMetric<K extends keyof BlinkMetrics>(
  blink: BlinkRuntime,
  key: K,
): BlinkMetrics[K] {
  return useSyncExternalStore(
    blink.subscribe,
    () => blink.metricsRef.current[key],
    () => blink.metricsRef.current[key],
  );
}
