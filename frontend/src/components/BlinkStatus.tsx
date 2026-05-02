"use client";

import { memo } from "react";

import type { BlinkRuntime } from "@/lib/blink/useBlink";
import { useBlinkMetric } from "@/lib/blink/useBlinkMetric";

import { Card, CardHeader } from "./Card";
import { MeterBar } from "./MeterBar";
import { StatusDot } from "./StatusDot";

type Props = {
  blink: BlinkRuntime;
  longThresholdMs: number;
  lookUpThresholdMs: number;
};

/**
 * Tracking panel. Discrete state (ready / faceDetected / error) drives the
 * outer chrome; the live numbers (closedness, hold timers) are read inside
 * `MeterBlock` / `StatBlock` via a throttled subscription so the parent
 * isn't forced to reconcile every video frame.
 */
function BlinkStatusInner({ blink, longThresholdMs, lookUpThresholdMs }: Props) {
  return (
    <Card className="p-4">
      <CardHeader title="Tracking" subtitle={<StatusDot blink={blink} />} />

      {blink.error && (
        <div className="mt-3 rounded-md border border-rose-500/30 bg-rose-500/10 p-2 text-xs text-rose-200">
          {blink.error}
        </div>
      )}

      <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
        <StatBlock blink={blink} label="Closedness" metricKey="closedness" />
        <StatBlock blink={blink} label="Upness" metricKey="upness" />
      </div>

      <div className="mt-4 space-y-3">
        <MeterBlock
          blink={blink}
          label="Hold blink (start / menu)"
          metricKey="closedForMs"
          thresholdMs={longThresholdMs}
          color="#34d399"
        />
        <MeterBlock
          blink={blink}
          label="Hold look-up (space)"
          metricKey="upForMs"
          thresholdMs={lookUpThresholdMs}
          color="#38bdf8"
        />
      </div>
    </Card>
  );
}

export const BlinkStatus = memo(BlinkStatusInner);

function MeterBlock({
  blink,
  label,
  metricKey,
  thresholdMs,
  color,
}: {
  blink: BlinkRuntime;
  label: string;
  metricKey: "closedForMs" | "upForMs";
  thresholdMs: number;
  color: string;
}) {
  const ms = useBlinkMetric(blink, (m) => m[metricKey]);
  return (
    <MeterBar
      label={label}
      value={ms / thresholdMs}
      color={color}
      rightLabel={`${(ms / 1000).toFixed(1)}s`}
    />
  );
}

function StatBlock({
  blink,
  label,
  metricKey,
}: {
  blink: BlinkRuntime;
  label: string;
  metricKey: "closedness" | "upness";
}) {
  const value = useBlinkMetric(blink, (m) => m[metricKey]);
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
