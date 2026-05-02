"use client";

import { Card, CardHeader } from "./Card";

type Props = {
  /** Top-k word continuations from the predictor. */
  suggestions: readonly string[];
  /** Live duration the user has been holding gaze right (from useBlink). */
  rightForMs: number;
  /** Whether the user is currently holding gaze right. */
  isLookingRight: boolean;
  /** Predictor still loading? Drives the placeholder. */
  loading?: boolean;
  /** Predictor load progress (0..1). */
  loadProgress?: number;
};

/**
 * The three "fill zones" of the dwell-to-accept gesture:
 *   - 0..INTENT_MS     → nothing armed (a glance is forgiven)
 *   - INTENT_MS+       → chip-N fills over PER_CHIP_MS, then cycles
 *
 * The exported helper picks which chip is active for a given held duration
 * so page.tsx can use the same logic to decide what to commit on release.
 */
export const INTENT_MS = 300;
export const PER_CHIP_MS = 400;

export function computeActiveChip(
  rightForMs: number,
  suggestionsLength: number,
): { index: number | null; fillFraction: number } {
  if (suggestionsLength === 0) return { index: null, fillFraction: 0 };
  if (rightForMs < INTENT_MS) return { index: null, fillFraction: 0 };
  const elapsed = rightForMs - INTENT_MS;
  const cycleMs = PER_CHIP_MS * suggestionsLength;
  const inCycle = elapsed % cycleMs;
  const index = Math.floor(inCycle / PER_CHIP_MS);
  const fillFraction = (inCycle % PER_CHIP_MS) / PER_CHIP_MS;
  return { index, fillFraction };
}

export function SuggestionStrip({
  suggestions,
  rightForMs,
  isLookingRight,
  loading = false,
  loadProgress = 0,
}: Props) {
  const { index: activeIndex, fillFraction } = isLookingRight
    ? computeActiveChip(rightForMs, suggestions.length)
    : { index: null, fillFraction: 0 };

  return (
    <Card className="p-4" active={isLookingRight && activeIndex !== null}>
      <CardHeader
        title="Suggestions"
        subtitle={
          loading ? (
            <span className="text-white/55">
              loading model… {Math.round(loadProgress * 100)}%
            </span>
          ) : suggestions.length === 0 ? (
            <span className="text-white/40">type to see predictions</span>
          ) : (
            <span className="text-white/55">look right to accept</span>
          )
        }
      />
      <div className="mt-3 flex gap-2">
        {suggestions.length === 0 ? (
          <Placeholder loading={loading} />
        ) : (
          suggestions.map((word, i) => (
            <Chip
              key={`${i}-${word}`}
              word={word}
              isActive={activeIndex === i}
              fill={activeIndex === i ? fillFraction : 0}
            />
          ))
        )}
      </div>
    </Card>
  );
}

function Chip({
  word,
  isActive,
  fill,
}: {
  word: string;
  isActive: boolean;
  fill: number;
}) {
  return (
    <div
      className={[
        "relative flex-1 overflow-hidden rounded-xl px-4 py-2 text-base font-semibold",
        "transition-[transform,box-shadow] duration-150",
        "sm:text-lg",
        isActive
          ? "scale-[1.04] text-black shadow-[0_8px_24px_-8px_rgba(6,182,212,0.6)]"
          : "text-white/85",
      ].join(" ")}
      style={{
        backgroundColor: isActive ? "rgba(6,182,212,0.15)" : "rgba(255,255,255,0.05)",
        boxShadow: !isActive ? "inset 0 0 0 1px rgba(255,255,255,0.08)" : undefined,
      }}
    >
      {/* Cyan fill layer behind the text — width tracks the dwell progress
          for the currently-active chip. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-y-0 left-0 transition-[width] duration-75"
        style={{
          width: `${Math.max(0, Math.min(1, fill)) * 100}%`,
          backgroundColor: "#06b6d4",
        }}
      />
      <span className="relative">{word}</span>
    </div>
  );
}

function Placeholder({ loading }: { loading: boolean }) {
  return (
    <div className="flex h-[44px] flex-1 items-center justify-center rounded-xl border border-dashed border-white/10 text-sm text-white/40">
      {loading ? "warming up the predictor…" : "—"}
    </div>
  );
}
