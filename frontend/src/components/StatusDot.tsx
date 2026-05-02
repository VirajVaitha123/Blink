"use client";

import type { BlinkDiscreteState } from "@/lib/blink/useBlink";

type Props = {
  blink: BlinkDiscreteState;
};

/**
 * Compact status indicator with a coloured dot + label. Reads only the
 * discrete fields (ready / faceDetected / error) so it never re-renders
 * because a per-frame metric ticked.
 */
export function StatusDot({ blink }: Props) {
  const { kind, label, dotClass } = describe(blink);
  return (
    <div className="flex items-center gap-2">
      <span
        className={[
          "h-2 w-2 rounded-full",
          dotClass,
          kind === "tracking" ? "animate-pulse" : "",
        ].join(" ")}
      />
      <span className="text-xs font-medium text-white/80">{label}</span>
    </div>
  );
}

function describe(blink: BlinkDiscreteState) {
  if (blink.error) {
    return { kind: "error", label: "Error", dotClass: "bg-rose-400" } as const;
  }
  if (!blink.ready) {
    return {
      kind: "loading",
      label: "Loading model…",
      dotClass: "bg-amber-400",
    } as const;
  }
  if (!blink.faceDetected) {
    return {
      kind: "no-face",
      label: "No face detected",
      dotClass: "bg-orange-400",
    } as const;
  }
  return {
    kind: "tracking",
    label: "Tracking",
    dotClass: "bg-emerald-400",
  } as const;
}
