/**
 * The control scheme: which eye gesture triggers which action, plus the
 * per-gesture tuning (hold time + trigger level) that feeds `useBlink`.
 *
 * Everything here is pure data + pure functions so both the main page
 * (which *acts* on bindings) and the /controls page (which *edits* them)
 * share one source of truth. Persistence lives in `useControls.ts`.
 */
import {
  DEFAULT_BLINK_CONFIG,
  type BlinkConfig,
  type BlinkKind,
  type BlinkMetrics,
} from "@/lib/blink/useBlink";

export type ActionId =
  | "select"
  | "space"
  | "backspace"
  | "menu"
  | "suggestions"
  | "speak"
  | "none";

export type Bindings = Record<BlinkKind, ActionId>;

export type ControlSettings = {
  bindings: Bindings;
  config: BlinkConfig;
  /** Time between scan-cursor advances, in ms. */
  scanMs: number;
};

export type ActionMeta = {
  id: ActionId;
  label: string;
  description: string;
  color: string;
};

export const ACTIONS: readonly ActionMeta[] = [
  {
    id: "select",
    label: "Select",
    description: "Lock the highlighted group, letter, command or word",
    color: "#34d399",
  },
  {
    id: "menu",
    label: "Start / Menu",
    description: "Start scanning, open the command menu, or cancel out",
    color: "#fbbf24",
  },
  {
    id: "space",
    label: "Space",
    description: "Insert a space straight away",
    color: "#38bdf8",
  },
  {
    id: "backspace",
    label: "Backspace",
    description: "Delete the last character",
    color: "#f472b6",
  },
  {
    id: "suggestions",
    label: "Suggestions",
    description: "Jump into the word-suggestion picker",
    color: "#a78bfa",
  },
  {
    id: "speak",
    label: "Speak",
    description: "Read the message out loud",
    color: "#fb923c",
  },
  {
    id: "none",
    label: "Off",
    description: "This gesture does nothing",
    color: "#64748b",
  },
] as const;

export const ACTION_BY_ID = Object.fromEntries(
  ACTIONS.map((a) => [a.id, a]),
) as Record<ActionId, ActionMeta>;

/** Pose of the hologram eyes: gaze −1..1 on each axis, lid openness 0..1. */
export type EyePose = { gx: number; gy: number; open: number };

export type GestureMeta = {
  kind: BlinkKind;
  label: string;
  /** Lower-case phrase for inline hints ("look up to lock"). */
  phrase: string;
  description: string;
  /** Config key holding this gesture's duration threshold. */
  holdKey: keyof BlinkConfig;
  holdLabel: string;
  holdMin: number;
  holdMax: number;
  holdStep: number;
  /** Config keys for the enter / exit (hysteresis) score thresholds. */
  highKey: keyof BlinkConfig;
  lowKey: keyof BlinkConfig;
  /** Live metric carrying the raw 0..1 score for this gesture. */
  levelMetric: keyof BlinkMetrics;
  /** Live metric carrying how long the gesture has been held, in ms. */
  holdMetric: keyof BlinkMetrics;
  /** What the hologram eyes do to demonstrate the gesture. */
  pose: EyePose;
};

const GAZE_HOLD = { holdMin: 30, holdMax: 2000, holdStep: 10 } as const;

export const GESTURES: Record<BlinkKind, GestureMeta> = {
  intent: {
    kind: "intent",
    label: "Blink",
    phrase: "blink",
    description:
      "A deliberate blink. Fires when you open your eyes again, so natural quick blinks are ignored.",
    holdKey: "intentMinMs",
    holdLabel: "Shortest blink that counts",
    holdMin: 100,
    holdMax: 1200,
    holdStep: 10,
    highKey: "closedThreshold",
    lowKey: "openThreshold",
    levelMetric: "closedness",
    holdMetric: "closedForMs",
    pose: { gx: 0, gy: 0, open: 0.04 },
  },
  long: {
    kind: "long",
    label: "Long blink",
    phrase: "hold a blink",
    description:
      "Keep your eyes closed. Fires while they are still shut, as soon as the hold time is reached.",
    holdKey: "longMinMs",
    holdLabel: "Keep eyes closed for",
    holdMin: 600,
    holdMax: 3000,
    holdStep: 50,
    highKey: "closedThreshold",
    lowKey: "openThreshold",
    levelMetric: "closedness",
    holdMetric: "closedForMs",
    pose: { gx: 0, gy: 0, open: 0.04 },
  },
  lookUp: {
    kind: "lookUp",
    label: "Look up",
    phrase: "look up",
    description: "Move your eyes up, keeping your head still.",
    holdKey: "lookUpMinMs",
    holdLabel: "Hold the look for",
    ...GAZE_HOLD,
    highKey: "lookUpHigh",
    lowKey: "lookUpLow",
    levelMetric: "upness",
    holdMetric: "upForMs",
    pose: { gx: 0, gy: -1, open: 1 },
  },
  lookDown: {
    kind: "lookDown",
    label: "Look down",
    phrase: "look down",
    description:
      "Move your eyes down towards your lap. Needs a higher trigger level than the others because reading the screen already looks slightly down.",
    holdKey: "lookDownHoldMs",
    holdLabel: "Hold the look for",
    ...GAZE_HOLD,
    highKey: "lookDownHigh",
    lowKey: "lookDownLow",
    levelMetric: "downness",
    holdMetric: "downForMs",
    pose: { gx: 0, gy: 1, open: 0.8 },
  },
  lookLeft: {
    kind: "lookLeft",
    label: "Look left",
    phrase: "look left",
    description: "Move your eyes to your left, keeping your head still.",
    holdKey: "lookLeftHoldMs",
    holdLabel: "Hold the look for",
    ...GAZE_HOLD,
    highKey: "lookLeftHigh",
    lowKey: "lookLeftLow",
    levelMetric: "leftness",
    holdMetric: "leftForMs",
    pose: { gx: -1, gy: 0, open: 1 },
  },
  lookRight: {
    kind: "lookRight",
    label: "Look right",
    phrase: "look right",
    description: "Move your eyes to your right, keeping your head still.",
    holdKey: "lookRightHoldMs",
    holdLabel: "Hold the look for",
    ...GAZE_HOLD,
    highKey: "lookRightHigh",
    lowKey: "lookRightLow",
    levelMetric: "rightness",
    holdMetric: "rightForMs",
    pose: { gx: 1, gy: 0, open: 1 },
  },
};

export const GESTURE_KINDS = Object.keys(GESTURES) as BlinkKind[];

export const TRIGGER_MIN = 0.15;
export const TRIGGER_MAX = 0.9;
/** A blink must be able to end before the long blink takes over. */
const BLINK_GAP_MS = 200;

export const DEFAULT_CONTROLS: ControlSettings = {
  bindings: {
    long: "menu",
    intent: "space",
    lookUp: "select",
    lookLeft: "backspace",
    lookRight: "suggestions",
    lookDown: "none",
  },
  config: DEFAULT_BLINK_CONFIG,
  scanMs: 1600,
};

export type Preset = {
  id: string;
  name: string;
  tagline: string;
  bindings: Bindings;
  config: BlinkConfig;
};

export const PRESETS: readonly Preset[] = [
  {
    id: "blink",
    name: "Blink",
    tagline: "Blink to select",
    bindings: {
      intent: "select",
      long: "menu",
      lookUp: "space",
      lookLeft: "backspace",
      lookRight: "suggestions",
      lookDown: "none",
    },
    config: {
      ...DEFAULT_BLINK_CONFIG,
      // Just above the involuntary-blink range, so selecting feels like a
      // firm blink rather than an eye-rest.
      intentMinMs: 250,
      // Look-up is no longer the rapid-fire commit; give it a real hold
      // so glancing up doesn't scatter spaces.
      lookUpMinMs: 500,
    },
  },
  {
    id: "gaze",
    name: "Gaze",
    tagline: "Look up to select",
    bindings: DEFAULT_CONTROLS.bindings,
    config: DEFAULT_CONTROLS.config,
  },
];

export function activePresetId(settings: ControlSettings): string | null {
  const match = PRESETS.find((p) =>
    GESTURE_KINDS.every((k) => p.bindings[k] === settings.bindings[k]),
  );
  return match?.id ?? null;
}

export function applyPreset(
  settings: ControlSettings,
  preset: Preset,
): ControlSettings {
  return { ...settings, bindings: preset.bindings, config: preset.config };
}

export function withBinding(
  settings: ControlSettings,
  kind: BlinkKind,
  action: ActionId,
): ControlSettings {
  return { ...settings, bindings: { ...settings.bindings, [kind]: action } };
}

/** Set a gesture's hold time, keeping blink < long blink. */
export function withHold(
  settings: ControlSettings,
  kind: BlinkKind,
  ms: number,
): ControlSettings {
  const meta = GESTURES[kind];
  const config = { ...settings.config };
  let value = clamp(ms, meta.holdMin, meta.holdMax);
  if (kind === "intent") {
    value = Math.min(value, config.longMinMs - BLINK_GAP_MS);
  } else if (kind === "long") {
    value = Math.max(value, config.intentMinMs + BLINK_GAP_MS);
  }
  config[meta.holdKey] = value;
  return { ...settings, config };
}

/**
 * Set a gesture's trigger level. The release (hysteresis) level follows
 * at the same proportion the hand-tuned defaults use, so there is one
 * knob to turn instead of two.
 */
export function withTrigger(
  settings: ControlSettings,
  kind: BlinkKind,
  level: number,
): ControlSettings {
  const meta = GESTURES[kind];
  const ratio =
    DEFAULT_BLINK_CONFIG[meta.lowKey] / DEFAULT_BLINK_CONFIG[meta.highKey];
  const high = clamp(level, TRIGGER_MIN, TRIGGER_MAX);
  const config = { ...settings.config };
  config[meta.highKey] = round2(high);
  config[meta.lowKey] = round2(high * ratio);
  return { ...settings, config };
}

/** First gesture bound to an action, or null when nothing triggers it. */
export function gestureFor(
  bindings: Bindings,
  action: ActionId,
): BlinkKind | null {
  return GESTURE_KINDS.find((k) => bindings[k] === action) ?? null;
}

/** Inline hint phrase for an action ("look up"), or null when unbound. */
export function hintFor(bindings: Bindings, action: ActionId): string | null {
  const kind = gestureFor(bindings, action);
  return kind ? GESTURES[kind].phrase : null;
}

export function formatSeconds(ms: number): string {
  const s = ms / 1000;
  return `${s.toFixed(ms % 100 === 0 ? 1 : 2)}s`;
}

/** How long a gesture takes, for legends: "0.5–1.5s", "0.8s", "instant". */
export function gestureTiming(kind: BlinkKind, config: BlinkConfig): string {
  if (kind === "intent") {
    return `${formatSeconds(config.intentMinMs)}–${formatSeconds(config.longMinMs)}`;
  }
  const ms = config[GESTURES[kind].holdKey];
  return ms < 150 ? "instant" : formatSeconds(ms);
}

/**
 * Coerce whatever was in storage into a valid settings object. Unknown or
 * malformed fields fall back to defaults so an old or hand-edited entry
 * can never leave the user without working controls.
 */
export function sanitizeControls(raw: unknown): ControlSettings {
  if (!raw || typeof raw !== "object") return DEFAULT_CONTROLS;
  const r = raw as Partial<Record<keyof ControlSettings, unknown>>;

  const bindings = { ...DEFAULT_CONTROLS.bindings };
  if (r.bindings && typeof r.bindings === "object") {
    const rb = r.bindings as Record<string, unknown>;
    for (const kind of GESTURE_KINDS) {
      const value = rb[kind];
      if (typeof value === "string" && value in ACTION_BY_ID) {
        bindings[kind] = value as ActionId;
      }
    }
  }

  const config = { ...DEFAULT_BLINK_CONFIG };
  if (r.config && typeof r.config === "object") {
    const rc = r.config as Record<string, unknown>;
    for (const key of Object.keys(config) as (keyof BlinkConfig)[]) {
      const value = rc[key];
      if (typeof value === "number" && Number.isFinite(value) && value > 0) {
        config[key] = value;
      }
    }
  }

  const scanMs =
    typeof r.scanMs === "number" && Number.isFinite(r.scanMs)
      ? clamp(r.scanMs, 500, 3000)
      : DEFAULT_CONTROLS.scanMs;

  return { bindings, config, scanMs };
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
