/**
 * Letter group layouts and command list for row-column scanning.
 *
 * 7 groups of 4 letters (alphabetical), with the last group also carrying
 * SPACE / BACKSPACE / MENU so they're reachable via the scanner. Space is
 * primarily entered with the look-up gesture; selecting it from the grid
 * is the fallback path. The MENU key is a shortcut into the command menu —
 * equivalent to a long blink, but reachable without holding the eyes closed.
 */

export const SPACE = "␣";
export const BACKSPACE = "⌫";
/** Selecting this character opens the command menu (alternative to long blink). */
export const MENU = "☰";

export type Group = readonly string[];

export const DEFAULT_GROUPS: readonly Group[] = [
  ["A", "B", "C", "D"],
  ["E", "F", "G", "H"],
  ["I", "J", "K", "L"],
  ["M", "N", "O", "P"],
  ["Q", "R", "S", "T"],
  ["U", "V", "W", "X"],
  ["Y", "Z", SPACE, BACKSPACE, MENU],
] as const;

/**
 * Cycle of background colors used to highlight the active group. We cycle
 * rather than colouring each group statically so the user has a strong
 * visual cue that scanning has advanced — even in their peripheral vision.
 */
export const HIGHLIGHT_COLORS = [
  "#ef4444", // red-500
  "#f97316", // orange-500
  "#eab308", // yellow-500
  "#22c55e", // green-500
  "#06b6d4", // cyan-500
  "#3b82f6", // blue-500
  "#a855f7", // purple-500
] as const;

/**
 * Command menu — entered via long blink while scanning, or via the ☰ key
 * in the last row. Resume is first so a quick blink cycle exits cleanly
 * without running anything destructive.
 */
export type CommandEffect =
  | "resume"
  | "stop"
  | "clear"
  | "backspace"
  | "play";

export type Command = {
  readonly id: CommandEffect;
  readonly label: string;
};

export const DEFAULT_COMMANDS: readonly Command[] = [
  { id: "resume", label: "Resume" },
  { id: "play", label: "▶ Play" },
  { id: "stop", label: "Stop" },
  { id: "backspace", label: "⌫ Backspace" },
  { id: "clear", label: "Clear all" },
] as const;
