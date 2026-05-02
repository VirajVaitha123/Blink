/**
 * Generic episode detectors for face-blendshape signals.
 *
 * Two patterns cover every gesture we care about:
 *
 *   - "blink" — eyes closed for a window. Two outputs: a *short* (intent)
 *     blink fires on release if duration >= intentMinMs (and the long
 *     threshold wasn't already crossed); a *long* blink fires while still
 *     closed once duration >= longMinMs, latched so it only fires once
 *     per episode.
 *
 *   - "sustain" — gaze held in a direction. One output: fires once per
 *     episode after duration >= sustainMs, latched until release.
 *
 * Both detectors use **hysteresis** — separate `enter` (cross to start)
 * and `exit` (cross to end) thresholds. This keeps detection stable when
 * the underlying score wobbles around the boundary.
 *
 * Detectors are pure objects with a `update(score, now)` tick. They don't
 * touch React, MediaPipe, or the rAF loop — the host hook calls them and
 * dispatches whatever they return.
 */

export type EpisodicEvent<K extends string> = {
  kind: K;
  durationMs: number;
};

export type Detector<K extends string> = {
  /** Feed the latest score + timestamp; get back any event that fired. */
  update(score: number, now: number): EpisodicEvent<K> | null;
  /** Force-end any active episode (e.g. on lost-face, or eyes-closed
   *  pausing gaze tracking). Resets the latched fire flag. */
  reset(): void;
  /** ms the current episode has been active, or 0 if not in an episode. */
  readonly holdMs: number;
};

export type BlinkDetectorConfig = {
  /** Score above which eyes count as closed (start of episode). */
  closedThreshold: number;
  /** Score below which eyes count as open (end of episode, hysteresis). */
  openThreshold: number;
  /** Min duration on release to count as an intentional short blink. */
  intentMinMs: number;
  /** Min sustained duration to fire a long blink (latched). */
  longMinMs: number;
};

export function createBlinkDetector(
  cfg: BlinkDetectorConfig,
): Detector<"intent" | "long"> {
  let startedAt: number | null = null;
  let longFired = false;
  let holdMs = 0;

  return {
    update(score, now) {
      const wasClosed = startedAt !== null;
      const isClosed = wasClosed
        ? score > cfg.openThreshold
        : score > cfg.closedThreshold;

      let event: EpisodicEvent<"intent" | "long"> | null = null;

      if (isClosed && !wasClosed) {
        startedAt = now;
        longFired = false;
      } else if (!isClosed && wasClosed) {
        const duration = now - (startedAt ?? now);
        startedAt = null;
        if (!longFired && duration >= cfg.intentMinMs) {
          event = { kind: "intent", durationMs: duration };
        }
        longFired = false;
      } else if (
        isClosed &&
        wasClosed &&
        !longFired &&
        now - (startedAt ?? now) >= cfg.longMinMs
      ) {
        // Crossed the long threshold while still closed — fire now so
        // the user gets feedback without having to open their eyes.
        longFired = true;
        event = { kind: "long", durationMs: now - (startedAt ?? now) };
      }

      holdMs = startedAt !== null ? now - startedAt : 0;
      return event;
    },
    reset() {
      startedAt = null;
      longFired = false;
      holdMs = 0;
    },
    get holdMs() {
      return holdMs;
    },
  };
}

export type SustainDetectorConfig<K extends string> = {
  /** Tag used on the emitted event. */
  kind: K;
  /** Score above which the gaze counts as "active" (start of episode). */
  enterThreshold: number;
  /** Score below which the gaze counts as released (hysteresis). */
  exitThreshold: number;
  /** Min sustained duration before the event fires. */
  sustainMs: number;
};

export function createSustainDetector<K extends string>(
  cfg: SustainDetectorConfig<K>,
): Detector<K> {
  let startedAt: number | null = null;
  let fired = false;
  let holdMs = 0;

  return {
    update(score, now) {
      const wasActive = startedAt !== null;
      const isActive = wasActive
        ? score > cfg.exitThreshold
        : score > cfg.enterThreshold;

      let event: EpisodicEvent<K> | null = null;

      if (isActive && !wasActive) {
        startedAt = now;
        fired = false;
      } else if (!isActive && wasActive) {
        startedAt = null;
        fired = false;
      } else if (
        isActive &&
        wasActive &&
        !fired &&
        now - (startedAt ?? now) >= cfg.sustainMs
      ) {
        fired = true;
        event = { kind: cfg.kind, durationMs: now - (startedAt ?? now) };
      }

      holdMs = startedAt !== null ? now - startedAt : 0;
      return event;
    },
    reset() {
      startedAt = null;
      fired = false;
      holdMs = 0;
    },
    get holdMs() {
      return holdMs;
    },
  };
}
