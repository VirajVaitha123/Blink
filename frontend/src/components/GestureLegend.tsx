"use client";

import { Card, CardHeader } from "./Card";

type GestureRow = {
  gesture: string;
  effect: string;
};

const GESTURES: readonly GestureRow[] = [
  { gesture: "Long blink (2s)", effect: "Start • open menu • cancel menu" },
  { gesture: "Short blink", effect: "Select (group → letter → commit)" },
  { gesture: "Look up (0.5s)", effect: "Insert space" },
] as const;

export function GestureLegend() {
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
