/**
 * Pure state machine for row-column scanning + a command menu.
 *
 * States:
 *   - "idle"            — waiting for start signal (long blink or button)
 *   - "groupScan"       — cursor cycles through letter groups; intent blink locks
 *   - "letterScan"      — cursor cycles through letters of locked group; intent
 *                         blink commits the letter, returns to groupScan
 *   - "commandScan"     — cursor cycles through commands; intent blink runs the
 *                         command (resume / stop / backspace / clear)
 *   - "suggestionScan"  — cursor cycles through frozen-on-entry word
 *                         suggestions; intent blink commits the active word
 *                         (replaces the partial), long blink cancels
 *
 * Long-blink while scanning enters commandScan; long-blink in commandScan
 * cancels back to groupScan. Look-up gesture inserts a space without
 * changing the scanner phase. Look-right (held) opens suggestionScan.
 * The MENU key (☰) in the last row is equivalent to a long blink.
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
  | { phase: "commandScan"; text: string; cursor: number }
  | {
      phase: "suggestionScan";
      text: string;
      cursor: number;
      suggestions: readonly string[];
    };

export type ScannerAction =
  | { type: "start" }
  | { type: "stop" }
  | { type: "tick" }
  | { type: "select" }
  | { type: "clear" }
  | { type: "enterCommands" }
  | { type: "exitCommands" }
  | { type: "enterSuggestions"; suggestions: readonly string[] }
  | { type: "exitSuggestions" }
  | { type: "insertChar"; char: string };

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

    case "enterSuggestions":
      // Allowed from idle / groupScan / letterScan. Idle entry is what
      // lets a user start a sentence (or resume after Clear) directly
      // from a SENTENCE_STARTERS pick without long-blinking Start first.
      // Block from commandScan (don't sidestep destructive commands)
      // and from within suggestionScan (already there).
      if (
        action.suggestions.length === 0 ||
        state.phase === "commandScan" ||
        state.phase === "suggestionScan"
      ) {
        return state;
      }
      return {
        phase: "suggestionScan",
        text: state.text,
        cursor: 0,
        suggestions: action.suggestions,
      };

    case "exitSuggestions":
      if (state.phase === "suggestionScan") {
        return { phase: "groupScan", text: state.text, cursor: 0 };
      }
      return state;

    case "insertChar":
      // Append a character without altering scanner phase. Used by the
      // look-up gesture for space, but generic so any external trigger
      // can insert text.
      return { ...state, text: state.text + action.char };

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
      if (state.phase === "suggestionScan") {
        return {
          ...state,
          cursor: (state.cursor + 1) % state.suggestions.length,
        };
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
      if (state.phase === "suggestionScan") {
        const word = state.suggestions[state.cursor];
        if (!word) return state;
        const lastSpace = state.text.lastIndexOf(" ");
        const base = state.text.slice(0, lastSpace + 1);
        // The grid feeds uppercase letters in; the predictor returns
        // lowercase. Match the existing transcript style on insertion.
        return {
          phase: "groupScan",
          text: base + word.toUpperCase() + " ",
          cursor: 0,
        };
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
