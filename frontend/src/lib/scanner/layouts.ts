/**
 * Letter group layouts and command list for row-column scanning.
 *
 * The default group layout mirrors what his sister does manually: groups of 4,
 * alphabetical. The last group bundles Y/Z with space and backspace so they
 * can still be selected if the look-up gesture isn't usable for the user.
 */

export const SPACE = "␣";
export const BACKSPACE = "⌫";

export type Group = readonly string[];

export const DEFAULT_GROUPS: readonly Group[] = [
  ["A", "B", "C", "D"],
  ["E", "F", "G", "H"],
  ["I", "J", "K", "L"],
  ["M", "N", "O", "P"],
  ["Q", "R", "S", "T"],
  ["U", "V", "W", "X"],
  ["Y", "Z", SPACE, BACKSPACE],
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
 * Command menu — entered via long blink while scanning. The first item is
 * Resume so an accidental long blink can be cancelled with one quick blink.
 */
export type CommandEffect = "resume" | "stop" | "clear" | "backspace";

export type Command = {
  readonly id: CommandEffect;
  readonly label: string;
};

export const DEFAULT_COMMANDS: readonly Command[] = [
  { id: "resume", label: "Resume" },
  { id: "stop", label: "Stop" },
  { id: "backspace", label: "⌫ Backspace" },
  { id: "clear", label: "Clear all" },
] as const;
