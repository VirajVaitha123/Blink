"use client";

import { Card, CardHeader } from "./Card";

type Props = {
  scanMs: number;
  onChange: (next: number) => void;
};

export function ScanSpeedControl({ scanMs, onChange }: Props) {
  // Show 1 decimal when the value is a clean 100ms multiple ("1.1s"),
  // 2 decimals otherwise ("1.05s") so a 50ms-step adjustment is visible.
  const label = `${(scanMs / 1000).toFixed(scanMs % 100 === 0 ? 1 : 2)}s`;

  return (
    <Card className="p-4">
      <CardHeader
        title="Scan speed"
        subtitle={
          <span className="font-mono tabular-nums text-white/80">{label}</span>
        }
      />
      <input
        type="range"
        min={500}
        max={3000}
        step={50}
        value={scanMs}
        onChange={(e) => onChange(Number(e.target.value))}
        className="mt-3 w-full"
      />
      <div className="mt-1 flex justify-between text-[10px] uppercase tracking-wider text-white/35">
        <span>fast</span>
        <span>slow</span>
      </div>
    </Card>
  );
}
