"use client";

import { useMemo } from "react";

import { HIGHLIGHT_COLORS, type Group } from "@/lib/scanner/layouts";
import type { ScannerState } from "@/lib/scanner/machine";

import { Card, CardHeader } from "./Card";
import { KeyButton } from "./KeyButton";

type Props = {
  groups: readonly Group[];
  state: ScannerState;
};

type FlatKey = {
  char: string;
  groupIndex: number;
  charIndexInGroup: number;
};

/**
 * Renders the scanner keyboard. The data model is N groups × M chars (each
 * group is the unit of group-scan); we lay them out in an 8-column grid for
 * a more keyboard-like presentation. Color still cycles per group, so two
 * adjacent groups on the same visual row get different colours and the
 * scanning rhythm stays clear.
 */
export function ScanGrid({ groups, state }: Props) {
  const flat = useMemo<FlatKey[]>(
    () =>
      groups.flatMap((g, groupIndex) =>
        g.map((char, charIndexInGroup) => ({
          char,
          groupIndex,
          charIndexInGroup,
        })),
      ),
    [groups],
  );

  const dimmed = state.phase === "commandScan";

  return (
    <Card className="p-4 sm:p-5" active={!dimmed && state.phase !== "idle"}>
      <CardHeader
        title="Keyboard"
        subtitle={
          state.phase === "groupScan"
            ? "Locking group"
            : state.phase === "letterScan"
              ? "Locking letter"
              : null
        }
      />
      <div
        className="mt-4 grid grid-cols-8 gap-1.5 transition-opacity duration-200 sm:gap-2"
        style={{ opacity: dimmed ? 0.35 : 1 }}
      >
        {flat.map((k) => {
          const isActiveGroup =
            state.phase === "groupScan" && state.cursor === k.groupIndex;
          const isLockedGroup =
            state.phase === "letterScan" && state.groupIndex === k.groupIndex;
          const isActiveLetter =
            state.phase === "letterScan" &&
            state.groupIndex === k.groupIndex &&
            state.cursor === k.charIndexInGroup;

          const color =
            HIGHLIGHT_COLORS[k.groupIndex % HIGHLIGHT_COLORS.length];

          return (
            <KeyButton
              key={`${k.groupIndex}-${k.charIndexInGroup}`}
              label={k.char}
              isActive={isActiveGroup || isActiveLetter}
              isLocked={isLockedGroup && !isActiveLetter}
              highlightColor={color}
            />
          );
        })}
      </div>
    </Card>
  );
}
