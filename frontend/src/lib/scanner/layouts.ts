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
 * Visible label for a group ("A to D"). Picks the first and last
 * *letter* in the group; ignores SPACE / BACKSPACE / MENU symbols
 * which aren't meaningfully announceable in this form. The last group
 * ("Y", "Z", SPACE, BACKSPACE, MENU) becomes "Y to Z".
 *
 * For *spoken* labels, prefer `groupSpokenLabel` — TTS engines tend to
 * mispronounce isolated letters ("A" → "uh") so we need to spell the
 * letter names out phonetically.
 */
export function groupLabel(group: Group): string {
  const letters = group.filter((c) => /^[A-Z]$/.test(c));
  if (letters.length === 0) return "";
  if (letters.length === 1) return letters[0];
  return `${letters[0]} to ${letters[letters.length - 1]}`;
}

/**
 * Phonetic letter-name spelling, so TTS reads "A" as "ay" (long A name)
 * rather than "uh" (the indefinite article it's almost always treated
 * as in natural text). Same trick used for product names, model
 * numbers, etc. Tuned to American premade ElevenLabs voices ("zee"
 * not "zed"); swap if the configured voice is British.
 */
const LETTER_PRONUNCIATION: Readonly<Record<string, string>> = {
  A: "ay", B: "bee", C: "see", D: "dee", E: "ee", F: "ef", G: "gee",
  H: "aitch", I: "eye", J: "jay", K: "kay", L: "el", M: "em", N: "en",
  O: "oh", P: "pee", Q: "cue", R: "ar", S: "ess", T: "tee", U: "you",
  V: "vee", W: "double you", X: "ex", Y: "why", Z: "zee",
};

function pronounce(letter: string): string {
  return LETTER_PRONUNCIATION[letter] ?? letter;
}

/**
 * Spoken form of `groupLabel` — fed directly to the TTS proxy.
 * "A to D" → "ay to dee", "E to H" → "ee to aitch", etc.
 */
export function groupSpokenLabel(group: Group): string {
  const letters = group.filter((c) => /^[A-Z]$/.test(c));
  if (letters.length === 0) return "";
  if (letters.length === 1) return pronounce(letters[0]);
  return `${pronounce(letters[0])} to ${pronounce(letters[letters.length - 1])}`;
}

export const DEFAULT_GROUP_LABELS: readonly string[] =
  DEFAULT_GROUPS.map(groupLabel);

export const DEFAULT_GROUP_SPOKEN_LABELS: readonly string[] =
  DEFAULT_GROUPS.map(groupSpokenLabel);

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
