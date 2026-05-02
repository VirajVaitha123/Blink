"use client";

import { Card, CardHeader } from "./Card";

type Props = {
  /** Top-k suggestions; frozen on suggestionScan entry, live otherwise. */
  suggestions: readonly string[];
  /** Live duration the user has been holding gaze right (from useBlink). */
  rightForMs: number;
  /** Whether the user is currently holding gaze right. */
  isLookingRight: boolean;
  /** lookRight hold-to-fill threshold from useBlink config. */
  holdMs: number;
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

export function SuggestionStrip({
  suggestions,
  rightForMs,
  isLookingRight,
  holdMs,
  activeIndex,
  loading = false,
}: Props) {
  const inPicker = activeIndex !== null;
  // Single fill bar across the whole card body — the dwell-to-enter
  // affordance. Hidden once the picker opens; the active-chip cursor
  // takes over from there.
  const showFill = !inPicker && isLookingRight && suggestions.length > 0;
  const fillFraction = showFill ? Math.min(1, rightForMs / holdMs) : 0;

  return (
    <Card
      className="relative overflow-hidden p-4"
      active={inPicker || showFill}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-y-0 left-0 transition-[width] duration-75"
        style={{
          width: `${fillFraction * 100}%`,
          backgroundColor: "rgba(6,182,212,0.18)",
        }}
      />
      <div className="relative">
        <CardHeader
          title="Suggestions"
          subtitle={
            loading ? (
              <span className="text-white/55">loading wordlist…</span>
            ) : suggestions.length === 0 ? (
              <span className="text-white/40">type to see predictions</span>
            ) : inPicker ? (
              <span className="text-white/55">blink to commit · hold to exit</span>
            ) : (
              <span className="text-white/55">look right to open</span>
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
