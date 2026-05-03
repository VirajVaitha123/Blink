"use client";

import { memo } from "react";

import { Card, CardHeader } from "./Card";

type GestureRow = {
  gesture: string;
  effect: string;
};

const GESTURES: readonly GestureRow[] = [
  { gesture: "Long blink (1.5s)", effect: "Start • open menu • cancel menu" },
  { gesture: "Look up", effect: "Select (group → letter → commit)" },
  { gesture: "Short blink (0.5–1.5s)", effect: "Insert space" },
  { gesture: "Look right (1s)", effect: "Open suggestion picker" },
  { gesture: "☰ key", effect: "Open command menu (no holding)" },
] as const;

export const GestureLegend = memo(GestureLegendInner);

function GestureLegendInner() {
  return (
    <Card className="p-4">
      <CardHeader title="Gestures" />
      <ul className="mt-3 space-y-2">
        {GESTURES.map((g) => (
          <li
            key={g.gesture}
            className="flex items-baseline justify-between gap-3 text-sm"
          >
            <span className="font-medium text-white/90">{g.gesture}</span>
            <span className="text-right text-xs text-white/55">
              {g.effect}
            </span>
          </li>
        ))}
      </ul>
    </Card>
  );
}
