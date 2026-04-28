"use client";

import { Card, CardHeader } from "./Card";

type Props = {
  scanMs: number;
  onChange: (next: number) => void;
};

export function ScanSpeedControl({ scanMs, onChange }: Props) {
  return (
    <Card className="p-4">
      <CardHeader
        title="Scan speed"
        subtitle={
          <span className="font-mono tabular-nums text-white/80">
            {(scanMs / 1000).toFixed(1)}s
          </span>
        }
      />
      <input
        type="range"
        min={500}
        max={3000}
        step={100}
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
