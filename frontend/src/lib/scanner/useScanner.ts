/**
 * React hook that hosts the scanner state machine and drives its tick.
 *
 * Inputs are pushed in via `dispatch`:
 *   - intent blink → dispatch({ type: "select" })
 *   - long blink (while idle)  → dispatch({ type: "start" })
 *   - long blink (while scanning) → dispatch({ type: "stop" })
 *
 * The tick interval runs only while we're in groupScan / letterScan.
 */
"use client";

import { useEffect, useReducer, useRef } from "react";

import { DEFAULT_GROUPS, type Group } from "./layouts";
import {
  initialState,
  reduce,
  type ScannerAction,
  type ScannerState,
} from "./machine";

export type UseScannerOptions = {
  /** Time between cursor advances, in ms. */
  scanMs?: number;
  /** Letter group layout. Defaults to the alphabetical 4-letter groups. */
  groups?: readonly Group[];
};

export function useScanner({
  scanMs = 1500,
  groups = DEFAULT_GROUPS,
}: UseScannerOptions = {}): {
  state: ScannerState;
  dispatch: (action: ScannerAction) => void;
} {
  const groupsRef = useRef(groups);
  groupsRef.current = groups;

  const [state, dispatchInternal] = useReducer(
    (s: ScannerState, a: ScannerAction) =>
      reduce(s, a, { groups: groupsRef.current }),
    undefined,
    initialState,
  );

  // Run the cursor tick only while actively scanning.
  useEffect(() => {
    if (state.phase === "idle") return;
    const id = window.setInterval(() => dispatchInternal({ type: "tick" }), scanMs);
    return () => window.clearInterval(id);
  }, [state.phase, scanMs]);

  return { state, dispatch: dispatchInternal };
}
