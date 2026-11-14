"use client";

import { memo } from "react";

import type { BlinkMetrics, BlinkRuntime } from "@/lib/blink/useBlink";
import { useBlinkMetric } from "@/lib/blink/useBlinkMetric";

import { Card, CardHeader } from "./Card";

type Props = {
  /** Top-k suggestions; frozen on suggestionScan entry, live otherwise. */
  suggestions: readonly string[];
  /** Subscribable runtime; used by the inner DwellFill child. */
  blink: BlinkRuntime;
  /**
   * Hold metric + threshold of whichever gesture opens the picker, or
   * null when no gesture does (then there is no fill).
   */
  openHold: { metric: keyof BlinkMetrics; holdMs: number } | null;
  /** Inline hints for the bound gestures ("look up"), null when unbound. */
  openHint: string | null;
  selectHint: string | null;
  cancelHint: string | null;
  /**
   * Cursor index when the scanner is in suggestionScan phase, otherwise null.
   * When non-null the chip at this index gets the active-cursor highlight,
   * matching the look of the letter and command scans.
   */
  activeIndex: number | null;
  /** Wordlist still fetching? (Brief — it's a JSON file, not a model.) */
  loading?: boolean;
};

const HIGHLIGHT_COLOR = "#06b6d4"; // cyan-500, matches the play command pill

function SuggestionStripInner({
  suggestions,
  blink,
  openHold,
  openHint,
  selectHint,
  cancelHint,
  activeIndex,
  loading = false,
}: Props) {
  const inPicker = activeIndex !== null;
  const canFill = !inPicker && suggestions.length > 0;

  return (
    <Card className="relative overflow-hidden p-4" active={inPicker}>
      {openHold && (
        <DwellFill
          blink={blink}
          metric={openHold.metric}
          holdMs={openHold.holdMs}
          enabled={canFill}
        />
      )}
      <div className="relative">
        <CardHeader
          title="Suggestions"
          subtitle={
            loading ? (
              <span className="text-white/55">loading wordlist…</span>
            ) : suggestions.length === 0 ? (
              <span className="text-white/40">type to see predictions</span>
            ) : inPicker ? (
              <span className="text-white/55">
                {[
                  selectHint && `${selectHint} to commit`,
                  cancelHint && `${cancelHint} to exit`,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </span>
            ) : (
              openHint && (
                <span className="text-white/55">{openHint} to open</span>
              )
            )
          }
        />
        <div className="mt-3 flex flex-wrap gap-2">
          {suggestions.length === 0 ? (
            <Placeholder loading={loading} />
          ) : (
            suggestions.map((word, i) => (
              <Chip
                key={`${i}-${word}`}
                word={word}
                isActive={inPicker && activeIndex === i}
              />
            ))
          )}
        </div>
      </div>
    </Card>
  );
}

export const SuggestionStrip = memo(SuggestionStripInner);

/**
 * The dwell-fill bar — the only part of the strip that needs to re-render
 * while the user holds the open gesture. Subscribes to its hold metric
 * directly so the parent strip stays still during the fill animation.
 */
function DwellFill({
  blink,
  metric,
  holdMs,
  enabled,
}: {
  blink: BlinkRuntime;
  metric: keyof BlinkMetrics;
  holdMs: number;
  enabled: boolean;
}) {
  const heldMs = useBlinkMetric(blink, metric);
  const fraction = enabled ? Math.min(1, heldMs / holdMs) : 0;
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-y-0 left-0 transition-[width] duration-75"
      style={{
        width: `${fraction * 100}%`,
        backgroundColor: "rgba(6,182,212,0.18)",
      }}
    />
  );
}

function Chip({ word, isActive }: { word: string; isActive: boolean }) {
  return (
    <div
      className={[
        "flex-1 rounded-xl px-4 py-2 text-base font-semibold",
        "transition-[transform,background-color,color,box-shadow] duration-200",
        "sm:text-lg",
        isActive
          ? "scale-[1.04] text-black"
          : "text-white/85",
      ].join(" ")}
      style={
        isActive
          ? {
              backgroundColor: HIGHLIGHT_COLOR,
              boxShadow: `0 0 0 2px ${HIGHLIGHT_COLOR}, 0 8px 24px -8px ${HIGHLIGHT_COLOR}`,
            }
          : {
              backgroundColor: "rgba(255,255,255,0.05)",
              boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.08)",
            }
      }
    >
      {word}
    </div>
  );
}

function Placeholder({ loading }: { loading: boolean }) {
  return (
    <div className="flex h-[44px] flex-1 items-center justify-center rounded-xl border border-dashed border-white/10 text-sm text-white/40">
      {loading ? "warming up…" : "—"}
    </div>
  );
}
