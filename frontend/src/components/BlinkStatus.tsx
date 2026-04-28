"use client";

import type { BlinkRuntimeState } from "@/lib/blink/useBlink";

import { Card, CardHeader } from "./Card";
import { MeterBar } from "./MeterBar";
import { StatusDot } from "./StatusDot";

type Props = {
  blink: BlinkRuntimeState;
  longThresholdMs: number;
  lookUpThresholdMs: number;
};

export function BlinkStatus({
  blink,
  longThresholdMs,
  lookUpThresholdMs,
}: Props) {
  return (
    <Card className="p-4">
      <CardHeader title="Tracking" subtitle={<StatusDot blink={blink} />} />

      {blink.error && (
        <div className="mt-3 rounded-md border border-rose-500/30 bg-rose-500/10 p-2 text-xs text-rose-200">
          {blink.error}
        </div>
      )}

      <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
        <Stat label="Closedness" value={blink.closedness} />
        <Stat label="Upness" value={blink.upness} />
      </div>

      <div className="mt-4 space-y-3">
        <MeterBar
          label="Hold blink (start / menu)"
          value={blink.closedForMs / longThresholdMs}
          color="#34d399"
          rightLabel={`${(blink.closedForMs / 1000).toFixed(1)}s`}
        />
        <MeterBar
          label="Hold look-up (space)"
          value={blink.upForMs / lookUpThresholdMs}
          color="#38bdf8"
          rightLabel={`${(blink.upForMs / 1000).toFixed(1)}s`}
        />
      </div>
    </Card>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-2">
      <div className="text-[10px] uppercase tracking-wider text-white/45">
        {label}
      </div>
      <div className="font-mono text-lg tabular-nums text-white/95">
        {value.toFixed(2)}
      </div>
    </div>
  );
}
