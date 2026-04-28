/**
 * React hook that hosts the scanner state machine and drives its tick.
 *
 * Inputs are pushed in via `dispatch` from page-level event handlers:
 *   - intent blink                    → dispatch({ type: "select" })
 *   - long blink while idle           → dispatch({ type: "start" })
 *   - long blink while scanning       → dispatch({ type: "enterCommands" })
 *   - long blink while in commandScan → dispatch({ type: "exitCommands" })
 *   - look-up gesture                 → dispatch({ type: "insertChar", char: " " })
 *
 * The tick interval runs only while we're in a scanning phase
 * (groupScan / letterScan / commandScan).
 */
"use client";

import { useEffect, useReducer, useRef } from "react";

import { DEFAULT_COMMANDS, DEFAULT_GROUPS, type Command, type Group } from "./layouts";
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
  /** Command list shown in commandScan. */
  commands?: readonly Command[];
};

export function useScanner({
  scanMs = 1500,
  groups = DEFAULT_GROUPS,
  commands = DEFAULT_COMMANDS,
}: UseScannerOptions = {}): {
  state: ScannerState;
  dispatch: (action: ScannerAction) => void;
} {
  const groupsRef = useRef(groups);
  groupsRef.current = groups;
  const commandsRef = useRef(commands);
  commandsRef.current = commands;

  const [state, dispatchInternal] = useReducer(
    (s: ScannerState, a: ScannerAction) =>
      reduce(s, a, {
        groups: groupsRef.current,
        commands: commandsRef.current,
      }),
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
