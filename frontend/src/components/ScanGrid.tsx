"use client";

import { HIGHLIGHT_COLORS, type Group } from "@/lib/scanner/layouts";
import type { ScannerState } from "@/lib/scanner/machine";

type Props = {
  groups: readonly Group[];
  state: ScannerState;
};

export function ScanGrid({ groups, state }: Props) {
  return (
    <div className="space-y-2">
      {groups.map((group, gi) => {
        const isActiveGroup =
          state.phase === "groupScan" && state.cursor === gi;
        const isLockedGroup =
          state.phase === "letterScan" && state.groupIndex === gi;

        const groupColor = HIGHLIGHT_COLORS[gi % HIGHLIGHT_COLORS.length];

        return (
          <div
            key={gi}
            className="flex items-center gap-2 rounded-lg p-2 transition-colors"
            style={{
              backgroundColor: isActiveGroup
                ? groupColor
                : isLockedGroup
                  ? "rgba(255,255,255,0.08)"
                  : "transparent",
              outline: isLockedGroup
                ? `3px solid ${groupColor}`
                : "3px solid transparent",
            }}
          >
            {group.map((ch, li) => {
              const isActiveLetter =
                state.phase === "letterScan" &&
                state.groupIndex === gi &&
                state.cursor === li;
              return (
                <div
                  key={li}
                  className="flex h-16 w-16 items-center justify-center rounded-md text-3xl font-bold transition-colors sm:h-20 sm:w-20 sm:text-4xl"
                  style={{
                    backgroundColor: isActiveLetter
                      ? groupColor
                      : "rgba(255,255,255,0.06)",
                    color: isActiveLetter ? "#000" : "#fff",
                  }}
                >
                  {ch}
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}
