/**
 * Pure state machine for two-level row-column scanning.
 *
 * States:
 *   - "idle"        — waiting for start signal (long blink or button)
 *   - "groupScan"   — cursor cycles through groups; intent blink locks group
 *   - "letterScan"  — cursor cycles through letters of locked group; intent
 *                     blink commits letter, then transitions back to groupScan
 *
 * The machine is pure: it takes the previous state + an action and returns
 * the next state. The hook in `useScanner.ts` drives ticks via setInterval
 * and forwards blink events as actions.
 */

import { BACKSPACE, SPACE, type Group } from "./layouts";

export type ScannerState =
  | { phase: "idle"; text: string }
  | { phase: "groupScan"; text: string; cursor: number }
  | { phase: "letterScan"; text: string; groupIndex: number; cursor: number };

export type ScannerAction =
  | { type: "start" }
  | { type: "stop" }
  | { type: "tick" }
  | { type: "select" }
  | { type: "clear" };

export type ScannerConfig = {
  groups: readonly Group[];
};

export function initialState(): ScannerState {
  return { phase: "idle", text: "" };
}

export function reduce(
  state: ScannerState,
  action: ScannerAction,
  config: ScannerConfig,
): ScannerState {
  const { groups } = config;

  switch (action.type) {
    case "stop":
      return { phase: "idle", text: state.text };

    case "clear":
      return { phase: state.phase === "idle" ? "idle" : "idle", text: "" };

    case "start":
      if (state.phase !== "idle") return state;
      return { phase: "groupScan", text: state.text, cursor: 0 };

    case "tick": {
      if (state.phase === "groupScan") {
        return { ...state, cursor: (state.cursor + 1) % groups.length };
      }
      if (state.phase === "letterScan") {
        const groupLen = groups[state.groupIndex].length;
        return { ...state, cursor: (state.cursor + 1) % groupLen };
      }
      return state;
    }

    case "select": {
      if (state.phase === "groupScan") {
        return {
          phase: "letterScan",
          text: state.text,
          groupIndex: state.cursor,
          cursor: 0,
        };
      }
      if (state.phase === "letterScan") {
        const ch = groups[state.groupIndex][state.cursor];
        const nextText = applyChar(state.text, ch);
        return { phase: "groupScan", text: nextText, cursor: 0 };
      }
      return state;
    }
  }
}

function applyChar(text: string, ch: string): string {
  if (ch === BACKSPACE) return text.slice(0, -1);
  if (ch === SPACE) return text + " ";
  return text + ch;
}
