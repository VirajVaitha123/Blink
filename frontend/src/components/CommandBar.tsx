"use client";

import { memo } from "react";

import type { BlinkRuntime } from "@/lib/blink/useBlink";
import { useBlinkMetric } from "@/lib/blink/useBlinkMetric";
import { type Command, type CommandEffect } from "@/lib/scanner/layouts";
import type { ScannerState } from "@/lib/scanner/machine";

import { Card, CardHeader } from "./Card";

type Props = {
  commands: readonly Command[];
  state: ScannerState;
  /** For the look-left dwell-fill on the Backspace pill. */
  blink: BlinkRuntime;
  /** lookLeft hold-to-fill threshold from useBlink config. */
  lookLeftHoldMs: number;
};

// Semantic command colours: green = safe / continue, red = destructive,
// blue/purple = neutral edits. Falls back to slate if a new command id
// is added without an entry here.
const COMMAND_COLORS: Record<CommandEffect, string> = {
  resume: "#22c55e", // green-500
  play: "#06b6d4", // cyan-500
  stop: "#ef4444", // red-500
  backspace: "#3b82f6", // blue-500
  clear: "#a855f7", // purple-500
};

/**
 * Command menu — entered via long blink while scanning. Always rendered so
 * the gesture is discoverable, but visually muted when not the active phase.
 *
 * The Backspace pill carries an extra dwell-fill driven by `leftForMs`
 * so the user gets a peripheral-vision cue while holding gaze left. Same
 * "release to abort" affordance as the suggestion-card fill on look-right.
 */
export const CommandBar = memo(CommandBarInner);

function CommandBarInner({ commands, state, blink, lookLeftHoldMs }: Props) {
  const active = state.phase === "commandScan";
  return (
    <Card
      active={active}
      className="p-4 transition-opacity duration-200"
      style={{ opacity: active ? 1 : 0.55 }}
    >
      <CardHeader
        title="Command menu"
        subtitle={
          active ? "Blink to run" : <span className="text-white/40">Hold blink to open</span>
        }
      />
      <div className="mt-3 flex flex-wrap gap-2">
        {commands.map((cmd, i) => {
          const isActive = active && state.cursor === i;
          const color = COMMAND_COLORS[cmd.id] ?? "#64748b";
          return (
            <div
              key={cmd.id}
              className={[
                "relative overflow-hidden rounded-xl px-4 py-2 text-base font-semibold transition-[transform,background-color,color,box-shadow] duration-200",
                "sm:text-lg",
                isActive ? "scale-[1.04] text-black" : "text-white/85",
              ].join(" ")}
              style={
                isActive
                  ? {
                      backgroundColor: color,
                      boxShadow: `0 0 0 2px ${color}, 0 8px 24px -8px ${color}`,
                    }
                  : {
                      backgroundColor: "rgba(255,255,255,0.05)",
                      boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.08)",
                    }
              }
            >
              {cmd.id === "backspace" && !isActive && (
                <BackspaceDwellFill
                  blink={blink}
                  holdMs={lookLeftHoldMs}
                  color={color}
                />
              )}
              <span className="relative">{cmd.label}</span>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

/**
 * Pure look-left progress indicator on the Backspace pill. Subscribes to
 * `leftForMs` directly so the parent CommandBar doesn't reconcile during
 * the fill. The fill draws *behind* the label (z-order via the parent's
 * `relative`-positioned label span).
 */
function BackspaceDwellFill({
  blink,
  holdMs,
  color,
}: {
  blink: BlinkRuntime;
  holdMs: number;
  color: string;
}) {
  const leftForMs = useBlinkMetric(blink, "leftForMs");
  const fraction = Math.min(1, leftForMs / holdMs);
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-y-0 left-0 transition-[width] duration-75"
      style={{
        width: `${fraction * 100}%`,
        // 35% opacity so the label stays readable; same hue as the
        // active-pill background so the fill "previews" the locked state.
        backgroundColor: `${color}59`,
      }}
    />
  );
}
