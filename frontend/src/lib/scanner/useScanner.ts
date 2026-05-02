/**
 * React hook that hosts the scanner state machine and drives its tick.
 *
 * Inputs are pushed in via `dispatch` from page-level event handlers:
 *   - intent blink                       → dispatch({ type: "select" })
 *   - long blink while idle              → dispatch({ type: "start" })
 *   - long blink while scanning          → dispatch({ type: "enterCommands" })
 *   - long blink while in commandScan    → dispatch({ type: "exitCommands" })
 *   - long blink while in suggestionScan → dispatch({ type: "exitSuggestions" })
 *   - look-up gesture                    → dispatch({ type: "insertChar", char: " " })
 *   - look-right (held to fill)          → dispatch({ type: "enterSuggestions", ... })
 *
 * The tick interval runs in any non-idle phase (groupScan / letterScan /
 * commandScan / suggestionScan), all using the same `scanMs` cadence.
 */
"use client";

import { useEffect, useReducer, useRef } from "react";

import {
  DEFAULT_COMMANDS,
  DEFAULT_GROUPS,
  type Command,
  type Group,
} from "./layouts";
import {
  initialState,
  reduce,
  type ScannerAction,
  type ScannerState,
} from "./machine";

export type UseScannerOptions = {
  /** Time between cursor advances, in ms. */
  scanMs?: number;
  /**
   * Extra time before the first tick when entering a fresh scan phase
   * (idle → groupScan, or any → commandScan). Gives the user a moment
   * to react to the audio cue ("Starting" / "Opened menu") that fires
   * on those transitions.
   */
  headstartMs?: number;
  /** Letter group layout. Defaults to the alphabetical 4-letter groups. */
  groups?: readonly Group[];
  /** Command list shown in commandScan. */
  commands?: readonly Command[];
};

export function useScanner({
  scanMs = 1500,
  headstartMs = 700,
  groups = DEFAULT_GROUPS,
  commands = DEFAULT_COMMANDS,
}: UseScannerOptions = {}): {
  state: ScannerState;
  dispatch: (action: ScannerAction) => void;
} {
  const [state, dispatchInternal] = useReducer(
    (s: ScannerState, a: ScannerAction) => reduce(s, a, { groups, commands }),
    undefined,
    initialState,
  );

  // Track the phase we last scheduled a tick from so we can detect when
  // we're entering a fresh scan vs. cycling within one. Internal cycles
  // (groupScan ↔ letterScan, command resume → groupScan) shouldn't get
  // the head-start delay; only voice-cued entries do.
  const prevPhaseRef = useRef<ScannerState["phase"]>("idle");

  useEffect(() => {
    const prev = prevPhaseRef.current;
    prevPhaseRef.current = state.phase;
    if (state.phase === "idle") return;

    const cuedEntry =
      (prev === "idle" && state.phase === "groupScan") ||
      (prev !== "commandScan" && state.phase === "commandScan") ||
      (prev !== "suggestionScan" && state.phase === "suggestionScan");
    const firstTickDelay = scanMs + (cuedEntry ? headstartMs : 0);

    let intervalId: number | undefined;
    const timeoutId = window.setTimeout(() => {
      dispatchInternal({ type: "tick" });
      intervalId = window.setInterval(
        () => dispatchInternal({ type: "tick" }),
        scanMs,
      );
    }, firstTickDelay);

    return () => {
      window.clearTimeout(timeoutId);
      if (intervalId !== undefined) window.clearInterval(intervalId);
    };
  }, [state.phase, scanMs, headstartMs]);

  return { state, dispatch: dispatchInternal };
}
