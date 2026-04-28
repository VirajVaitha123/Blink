"use client";

type MeterBarProps = {
  label: string;
  /** 0..1 — clamped on render. */
  value: number;
  /** CSS colour for the filled portion. */
  color: string;
  /** Right-aligned info, usually a duration like "1.2s". */
  rightLabel?: string;
};

export function MeterBar({ label, value, color, rightLabel }: MeterBarProps) {
  const pct = Math.max(0, Math.min(1, value)) * 100;
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-xs">
        <span className="text-white/55">{label}</span>
        {rightLabel && (
          <span className="font-mono tabular-nums text-white/70">
            {rightLabel}
          </span>
        )}
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-white/[0.08]">
        <div
          className="h-full rounded-full transition-[width] duration-150"
          style={{ width: `${pct}%`, backgroundColor: color }}
        />
      </div>
    </div>
  );
}
