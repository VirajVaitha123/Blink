/**
 * Pure state machine for row-column scanning + a command menu.
 *
 * States:
 *   - "idle"         — waiting for start signal (long blink or button)
 *   - "groupScan"    — cursor cycles through letter groups; intent blink locks
 *   - "letterScan"   — cursor cycles through letters of locked group; intent
 *                      blink commits the letter, returns to groupScan
 *   - "commandScan"  — cursor cycles through commands; intent blink runs the
 *                      command (resume / stop / backspace / clear)
 *
 * Long-blink while scanning enters commandScan; long-blink in commandScan
 * cancels back to groupScan. Look-up gesture inserts a space without
 * changing the scanner phase (handled via the `insertChar` action). The
 * MENU key (☰) in the last row is equivalent to a long blink — picking
 * it transitions to commandScan.
 *
 * The machine is pure: it takes the previous state + an action + config
 * and returns the next state. Tick scheduling lives in `useScanner.ts`.
 */

import {
  type Command,
  type Group,
  BACKSPACE,
  MENU,
  SPACE,
} from "./layouts";

export type ScannerState =
  | { phase: "idle"; text: string }
  | { phase: "groupScan"; text: string; cursor: number }
  | { phase: "letterScan"; text: string; groupIndex: number; cursor: number }
  | { phase: "commandScan"; text: string; cursor: number };

export type ScannerAction =
  | { type: "start" }
  | { type: "stop" }
  | { type: "tick" }
  | { type: "select" }
  | { type: "clear" }
  | { type: "enterCommands" }
  | { type: "exitCommands" }
  | { type: "insertChar"; char: string }
  | { type: "setText"; text: string };

export type ScannerConfig = {
  groups: readonly Group[];
  commands: readonly Command[];
};

export function initialState(): ScannerState {
  return { phase: "idle", text: "" };
}

export function reduce(
  state: ScannerState,
  action: ScannerAction,
  config: ScannerConfig,
): ScannerState {
  const { groups, commands } = config;

  switch (action.type) {
    case "stop":
      return { phase: "idle", text: state.text };

    case "clear":
      return { phase: "idle", text: "" };

    case "start":
      if (state.phase !== "idle") return state;
      return { phase: "groupScan", text: state.text, cursor: 0 };

    case "enterCommands":
      if (state.phase === "groupScan" || state.phase === "letterScan") {
        return { phase: "commandScan", text: state.text, cursor: 0 };
      }
      return state;

    case "exitCommands":
      if (state.phase === "commandScan") {
        return { phase: "groupScan", text: state.text, cursor: 0 };
      }
      return state;

    case "insertChar":
      // Append a character without altering scanner phase. Used by the
      // look-up gesture for space, but generic so any external trigger
      // can insert text.
      return { ...state, text: state.text + action.char };

    case "setText":
      // Wholesale replace the transcript without changing scanner phase.
      // Used by the autocomplete accept gesture, where the suggested word
      // replaces the partial word at the end of the transcript.
      return { ...state, text: action.text };

    case "tick": {
      if (state.phase === "groupScan") {
        return { ...state, cursor: (state.cursor + 1) % groups.length };
      }
      if (state.phase === "letterScan") {
        const groupLen = groups[state.groupIndex].length;
        return { ...state, cursor: (state.cursor + 1) % groupLen };
      }
      if (state.phase === "commandScan") {
        return { ...state, cursor: (state.cursor + 1) % commands.length };
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
        // The MENU key acts like a long blink: open the command menu
        // without committing any text.
        if (ch === MENU) {
          return { phase: "commandScan", text: state.text, cursor: 0 };
        }
        return {
          phase: "groupScan",
          text: applyChar(state.text, ch),
          cursor: 0,
        };
      }
      if (state.phase === "commandScan") {
        return runCommand(state, commands[state.cursor]);
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

function runCommand(
  state: Extract<ScannerState, { phase: "commandScan" }>,
  cmd: Command,
): ScannerState {
  switch (cmd.id) {
    case "resume":
      return { phase: "groupScan", text: state.text, cursor: 0 };
    case "stop":
      return { phase: "idle", text: state.text };
    case "backspace":
      // Stay in the menu so consecutive backspaces are easy. Reset cursor
      // to position 0 (Resume) — the safest default after a destructive
      // action; the user must actively wait for the cursor to cycle back
      // to Backspace to delete another character.
      return {
        phase: "commandScan",
        text: state.text.slice(0, -1),
        cursor: 0,
      };
    case "clear":
      return { phase: "idle", text: "" };
    case "play":
      // TTS playback is a side effect handled by the page-level event
      // handler (see handleBlinkEvent). The reducer just keeps the user
      // in the menu with the cursor reset to Resume, mirroring backspace:
      // a quick blink then exits cleanly, or they can wait for Play to
      // come back around to repeat.
      return { phase: "commandScan", text: state.text, cursor: 0 };
  }
}
