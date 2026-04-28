"use client";

import { HIGHLIGHT_COLORS, type Command } from "@/lib/scanner/layouts";
import type { ScannerState } from "@/lib/scanner/machine";

type Props = {
  commands: readonly Command[];
  state: ScannerState;
};

/**
 * Horizontal command bar shown in scanner's `commandScan` phase. Cursor
 * cycles through the commands; intent blink runs the highlighted one.
 */
export function CommandBar({ commands, state }: Props) {
  const active = state.phase === "commandScan";
  return (
    <div
      className="flex flex-wrap items-center gap-2 rounded-lg border p-2 transition-colors"
      style={{
        borderColor: active ? "rgba(255,255,255,0.3)" : "rgba(255,255,255,0.1)",
        backgroundColor: active ? "rgba(255,255,255,0.05)" : "transparent",
        opacity: active ? 1 : 0.45,
      }}
    >
      <span className="px-2 text-xs uppercase tracking-wider text-white/60">
        Command menu
      </span>
      {commands.map((cmd, i) => {
        const isActive = active && state.cursor === i;
        const color = HIGHLIGHT_COLORS[i % HIGHLIGHT_COLORS.length];
        return (
          <div
            key={cmd.id}
            className="rounded-md px-3 py-2 text-base font-semibold transition-colors sm:text-lg"
            style={{
              backgroundColor: isActive ? color : "rgba(255,255,255,0.06)",
              color: isActive ? "#000" : "#fff",
            }}
          >
            {cmd.label}
          </div>
        );
      })}
    </div>
  );
}
